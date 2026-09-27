import { type NextRequest, NextResponse } from 'next/server'
import { UTApi } from 'uploadthing/server'

import { getPayloadClient } from '@/lib/payload'
import type { MailAttachment } from '@/payload-types'

export const runtime = 'nodejs'

// Serves mail attachments at the same path Payload's upload route would
// (/api/mail-attachments/file/:filename) but with working cookie auth.
//
// The built-in route authenticates the `payload-token` cookie only when the
// request carries an allowlisted Origin or a Sec-Fetch-Site header — a CSRF
// gate inside Payload's extractJWT. Clients that send neither (older Safari,
// in-app browsers, WKWebView, curl) always get 403 even with a valid session.
// This handler is read-only, so cookie auth without those headers is safe: it
// feeds the cookie through the JWT extractor directly, then applies the same
// participant-scoped read access the collection defines.
export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params
  if (!filename || filename.includes('..')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const payload = await getPayloadClient()

  // payload.auth's cookie extractor rejects sessions without Origin /
  // Sec-Fetch-Site, so pass the session cookie as a JWT bearer instead.
  // Authorization headers from API clients are left untouched.
  const authHeaders = new Headers(req.headers)
  const cookieToken = req.cookies.get(`${payload.config.cookiePrefix}-token`)?.value
  if (cookieToken && !authHeaders.has('authorization')) {
    authHeaders.set('authorization', `JWT ${cookieToken}`)
  }

  const { user } = await payload.auth({ headers: authHeaders })
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  // Access is still enforced — uploader, thread participant, or admin only.
  const { docs } = await payload.find({
    collection: 'mail-attachments',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const doc = docs[0] as MailAttachment | undefined
  if (!doc || !doc._key) return new NextResponse('Not found', { status: 404 })

  const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN })
  const { url } = await utapi.getSignedURL(doc._key).catch(() => ({ url: undefined }))
  if (!url) return new NextResponse('Not found', { status: 404 })

  const range = req.headers.get('range')
  const upstream = await fetch(url, {
    headers: range ? { Range: range } : undefined,
    cache: 'no-store',
  }).catch(() => null)
  if (!upstream?.body || (!upstream.ok && upstream.status !== 206)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const headers = new Headers()
  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']) {
    const value = upstream.headers.get(key)
    if (value) headers.set(key, value)
  }
  if (doc.filename) {
    headers.set(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
    )
  }
  // Access-controlled content — never store in shared/proxy caches.
  headers.set('Cache-Control', 'private, no-store')

  return new NextResponse(upstream.body, { status: upstream.status, headers })
}

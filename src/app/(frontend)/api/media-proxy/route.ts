import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Same-origin proxy for public media. Canvas exports (the downloadable
// invite QR card) need CORS-clean pixels; when the CDN doesn't send
// Access-Control-Allow-Origin the direct image load fails, so the client
// retries through here. Not an open proxy — upstreams are limited to the
// configured CDN host and UploadThing's file hosts.
const CDN_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_CDN_URL ?? '').hostname
  } catch {
    return ''
  }
})()

const isAllowedHost = (hostname: string) =>
  Boolean(hostname) &&
  (hostname === CDN_HOST || hostname === 'utfs.io' || hostname.endsWith('.ufs.sh'))

export async function GET(req: NextRequest) {
  let target: URL
  try {
    target = new URL(req.nextUrl.searchParams.get('url') ?? '')
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    !isAllowedHost(target.hostname)
  ) {
    return new NextResponse('Not found', { status: 404 })
  }

  const upstream = await fetch(target, { signal: AbortSignal.timeout(10_000) }).catch(() => null)
  const contentType = upstream?.headers.get('content-type') ?? ''
  if (!upstream?.ok || !upstream.body || !contentType.startsWith('image/')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const headers = new Headers({ 'Content-Type': contentType })
  for (const key of ['content-length', 'etag']) {
    const value = upstream.headers.get(key)
    if (value) headers.set(key, value)
  }
  // UploadThing file keys are unique per upload — safe to cache.
  headers.set('Cache-Control', 'public, max-age=86400')

  return new NextResponse(upstream.body, { headers })
}

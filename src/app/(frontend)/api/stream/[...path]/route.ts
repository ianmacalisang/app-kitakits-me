import { type NextRequest, NextResponse } from 'next/server'
import { gunzip } from 'zlib'
import { promisify } from 'util'

import { streamHostname } from '@/lib/bunny'

export const runtime = 'nodejs'

const gunzipAsync = promisify(gunzip)

// Proxies Bunny Stream HLS playlists. Bunny's edge stores .m3u8
// pre-compressed (zstd/gzip) and honors Range on the ENCODED bytes — a 206
// slice of a compressed body can't be inflated, so media elements that
// probe sources with "Range: bytes=0-" die with ERR_CONTENT_DECODING_FAILED.
// We fetch the whole playlist server-side, decode it, and re-serve it
// identity. Only *.m3u8 goes through here — segment (.ts) lines are
// rewritten to absolute Bunny URLs so the actual video bandwidth stays on
// their CDN.
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const rel = path?.join('/') ?? ''
  // "<guid>/<nested dirs>/<file>.m3u8" only — no traversal, no proxying
  // arbitrary Bunny objects.
  if (!/^[\w-]+(\/[\w.-]+)*\/[\w.-]+\.m3u8$/.test(rel) || rel.includes('..')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const host = streamHostname()
  if (!host) return new NextResponse('Stream not configured', { status: 502 })

  const upstream = await fetch(`${host}/${rel}`, {
    headers: {
      // Advertise only gzip so we never receive a zstd body we can't decode.
      'Accept-Encoding': 'gzip',
      // The library whitelists referrers — forward the page's so Bunny
      // accepts our fetch the same way it accepts the browser's.
      ...(req.headers.get('referer') ? { Referer: req.headers.get('referer')! } : {}),
    },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  }).catch(() => null)
  if (!upstream || !upstream.ok) return new NextResponse('Not found', { status: 404 })

  let body: Buffer = Buffer.from(await upstream.arrayBuffer())
  // undici may have already inflated the body — only gunzip if it still
  // looks like a gzip stream.
  if (body[0] === 0x1f && body[1] === 0x8b) body = await gunzipAsync(body)

  const dir = rel.slice(0, rel.lastIndexOf('/'))
  const rewrite = (uri: string) => {
    if (/^https?:\/\//.test(uri) || uri.startsWith('/')) return uri
    return uri.endsWith('.m3u8') ? `/api/stream/${dir}/${uri}` : `${host}/${dir}/${uri}`
  }

  const rewritten = body
    .toString('utf8')
    .split('\n')
    .map((line) => {
      const out = line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${rewrite(uri)}"`)
      if (!out.startsWith('#') && out.trim()) return rewrite(out.trim())
      return out
    })
    .join('\n')

  return new NextResponse(rewritten, {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      // Variant playlists can change while a video finishes encoding.
      'Cache-Control': 'no-cache',
    },
  })
}

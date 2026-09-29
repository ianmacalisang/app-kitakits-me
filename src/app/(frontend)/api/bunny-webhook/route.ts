import { NextResponse, type NextRequest } from 'next/server'

import { fetchStreamVideo } from '@/lib/bunny'
import { followerIds, pushLive } from '@/lib/live'
import { getPayloadClient } from '@/lib/payload'
import { relId } from '@/lib/serialize'

// Bunny Stream encoding-status webhook — configure the video library's
// webhook URL as https://<app>/api/bunny-webhook?secret=$BUNNY_WEBHOOK_SECRET.
// Payload: { VideoLibraryId, VideoGuid, Status } — Status 4 = finished,
// 5 = encoding error, 6 = upload failed.
export async function POST(req: NextRequest) {
  const secret = process.env.BUNNY_WEBHOOK_SECRET
  if (secret) {
    const given = req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-webhook-secret')
    if (given !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { VideoLibraryId?: number; VideoGuid?: string; Status?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (String(body.VideoLibraryId ?? '') !== (process.env.BUNNY_STREAM_LIBRARY_ID ?? '')) {
    return NextResponse.json({ error: 'Unknown library' }, { status: 400 })
  }

  const guid = body.VideoGuid
  const status =
    body.Status === 4 ? 'ready' : body.Status === 5 || body.Status === 6 ? 'failed' : null
  if (!guid || !status) return NextResponse.json({ ok: true })

  const payload = await getPayloadClient()
  const found = await payload.find({
    collection: 'videos',
    where: { bunnyVideoId: { equals: guid } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = found.docs[0]
  if (!doc) return NextResponse.json({ ok: true })

  // Fill in duration/dimensions from Bunny's video object on success.
  let meta: Record<string, unknown> = {}
  if (status === 'ready') {
    const info = await fetchStreamVideo(guid).catch(() => null)
    if (info) meta = { duration: info.duration, width: info.width, height: info.height }
  }

  await payload.update({
    collection: 'videos',
    id: doc.id,
    data: { status, ...meta },
    overrideAccess: true,
  })

  // Tell the owner (and their followers' open feeds) the moment the encode
  // finishes — the fallback poll in getVideoStatus covers anyone else.
  const ownerId = relId(doc.owner)
  if (ownerId !== null) {
    pushLive(
      followerIds(payload, ownerId).then((ids) => [ownerId, ...ids]),
      { type: 'video:status', videoId: doc.id, status },
    )
  }

  return NextResponse.json({ ok: true })
}

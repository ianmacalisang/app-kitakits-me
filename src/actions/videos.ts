'use server'

import { sql } from '@payloadcms/db-postgres'

import { getCurrentUser } from '@/lib/auth'
import { drizzleOf } from '@/lib/db'
import { followerIds, pushLive } from '@/lib/live'
import { rateLimitIP } from '@/lib/rate-limit'
import {
  bunnyStreamConfigured,
  createStreamVideo,
  deleteStreamVideo,
  fetchStreamVideo,
  TUS_ENDPOINT,
  tusUploadAuth,
} from '@/lib/bunny'
import { getPayloadClient } from '@/lib/payload'
import { relId, toVideoData, type PostVideoData } from '@/lib/serialize'

// Cap enforced server-side too — encoding minutes are billed, so huge files
// shouldn't rely on the client-side check alone.
const MAX_VIDEO_BYTES = 256 * 1024 * 1024

// getVideoStatus polls Bunny's API as a fallback while a doc isn't terminal —
// bounded to one call per video per interval per server instance, since every
// viewer's PostVideo polls this action every few seconds.
const lastBunnyCheck = new Map<number, number>()
const BUNNY_CHECK_MS = 15_000
// A video still uploading/processing this long after creation is wedged —
// surface it as failed rather than spinning forever.
const STALE_MS = 30 * 60_000

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>

// Push a terminal status to the owner + their followers so open PostVideo
// cards flip instantly instead of waiting for the next fallback poll.
function notifyVideoStatus(
  payload: PayloadClient,
  video: { id: number; owner: unknown },
  status: 'ready' | 'failed',
) {
  const ownerId = relId(video.owner)
  if (ownerId === null) return
  pushLive(
    followerIds(payload, ownerId).then((ids) => [ownerId, ...ids]),
    { type: 'video:status', videoId: video.id, status },
  )
}

export interface VideoUploadCredentials {
  videoId: number
  guid: string
  libraryId: string
  endpoint: string
  signature: string
  expires: number
}

// Creates the empty Bunny video + our metadata doc, then returns the TUS
// presign so the browser can upload the file directly to Bunny.
export async function createVideoUpload(input: {
  filename: string
  size: number
}): Promise<VideoUploadCredentials | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Sign in to upload a video.' }
  if (!bunnyStreamConfigured()) return { error: 'Video uploads are not configured.' }
  if (!Number.isFinite(input.size) || input.size <= 0) return { error: 'Invalid video file.' }
  if (input.size > MAX_VIDEO_BYTES) return { error: 'Video must be under 256MB.' }

  let guid: string
  try {
    guid = await createStreamVideo(input.filename)
  } catch {
    return { error: 'Could not start the video upload.' }
  }

  const payload = await getPayloadClient()
  const video = await payload.create({
    collection: 'videos',
    data: { bunnyVideoId: guid, owner: user.id, status: 'uploading' },
    user,
    overrideAccess: false,
  })

  const { signature, expires } = tusUploadAuth(guid)
  return {
    videoId: video.id,
    guid,
    libraryId: process.env.BUNNY_STREAM_LIBRARY_ID ?? '',
    endpoint: TUS_ENDPOINT,
    signature,
    expires,
  }
}

// The browser finished pushing the file — flip the doc so clients polling
// show "processing" until the Bunny webhook marks it ready.
export async function markVideoUploaded(videoId: number): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Sign in to upload a video.' }

  const payload = await getPayloadClient()
  try {
    const video = await payload.findByID({
      collection: 'videos',
      id: videoId,
      depth: 0,
      user,
      overrideAccess: false,
    })
    if (relId(video.owner) !== user.id) return { error: 'Video not found.' }

    // Conditional bulk update — a fast encode may have already flipped the
    // doc to ready via webhook; never overwrite that (it won't fire twice).
    await payload.update({
      collection: 'videos',
      where: { and: [{ id: { equals: videoId } }, { status: { not_equals: 'ready' } }] },
      data: { status: 'processing' },
      overrideAccess: true,
    })
  } catch {
    return { error: 'Video not found.' }
  }
  return {}
}

// Composer cancelled or replaced the pick — drop the doc and the Bunny video.
export async function discardVideo(videoId: number): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Sign in required.' }

  const payload = await getPayloadClient()
  try {
    const video = await payload.findByID({
      collection: 'videos',
      id: videoId,
      depth: 0,
      user,
      overrideAccess: false,
    })
    if (relId(video.owner) !== user.id) return { error: 'Video not found.' }
    await payload.delete({ collection: 'videos', id: videoId, user, overrideAccess: false })
    if (video.bunnyVideoId) await deleteStreamVideo(video.bunnyVideoId).catch(() => {})
  } catch {
    return { error: 'Video not found.' }
  }
  return {}
}

// Polled by PostVideo while a video encodes — returns the serialized card
// data (same shape the feed ships). Read access on videos is open, matching
// the unguessable-stream-URL posture used for images.
export async function getVideoStatus(videoId: number): Promise<PostVideoData | null> {
  const payload = await getPayloadClient()
  try {
    let video = await payload.findByID({
      collection: 'videos',
      id: videoId,
      depth: 0,
      overrideAccess: true,
    })
    if (video.status === 'ready' || video.status === 'failed') return toVideoData(video)

    const now = Date.now()
    const lastCheck = lastBunnyCheck.get(videoId) ?? 0

    // Fallback when the webhook can't reach us (localhost, missed delivery):
    // ask Bunny directly, throttled so concurrent pollers don't stampede it.
    if (now - lastCheck >= BUNNY_CHECK_MS) {
      lastBunnyCheck.set(videoId, now)
      const info = await fetchStreamVideo(video.bunnyVideoId).catch(() => null)
      // Bunny status: 4 = finished, 5 = encoding error, 6 = upload failed.
      if (info?.status === 4) {
        video = await payload.update({
          collection: 'videos',
          id: videoId,
          data: {
            status: 'ready',
            duration: info.duration,
            width: info.width,
            height: info.height,
          },
          overrideAccess: true,
        })
        lastBunnyCheck.delete(videoId)
        notifyVideoStatus(payload, video, 'ready')
      } else if (info?.status === 5 || info?.status === 6) {
        video = await payload.update({
          collection: 'videos',
          id: videoId,
          data: { status: 'failed' },
          overrideAccess: true,
        })
        lastBunnyCheck.delete(videoId)
        notifyVideoStatus(payload, video, 'failed')
      }
    }

    // Wedged upload or encode — fail it so the card stops spinning.
    if (
      video.status !== 'ready' &&
      video.status !== 'failed' &&
      now - new Date(video.createdAt).getTime() > STALE_MS
    ) {
      video = await payload.update({
        collection: 'videos',
        id: videoId,
        data: { status: 'failed' },
        overrideAccess: true,
      })
      notifyVideoStatus(payload, video, 'failed')
    }

    return toVideoData(video)
  } catch {
    return null
  }
}

// Called by PostVideo when playback starts — anyone can bump the count, so
// this bypasses the owner-only update access on purpose. One atomic UPDATE
// (no read-modify-write, so concurrent plays can't lose increments), with a
// per-IP ceiling since the action is unauthenticated.
export async function recordVideoPlay(videoId: number): Promise<{ playCount?: number }> {
  if (!Number.isFinite(videoId) || videoId <= 0) return {}
  if (!(await rateLimitIP('video-play', 30, 60_000))) return {}

  const payload = await getPayloadClient()
  const db = drizzleOf(payload)
  if (!db) return {}
  try {
    const { rows } = (await db.execute(
      sql`UPDATE videos SET play_count = play_count + 1 WHERE id = ${videoId} RETURNING play_count`,
    )) as { rows: { play_count: number }[] }
    return { playCount: rows[0]?.play_count }
  } catch {
    return {}
  }
}

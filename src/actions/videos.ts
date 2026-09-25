'use server'

import { getCurrentUser } from '@/lib/auth'
import {
  bunnyStreamConfigured,
  createStreamVideo,
  deleteStreamVideo,
  TUS_ENDPOINT,
  tusUploadAuth,
} from '@/lib/bunny'
import { getPayloadClient } from '@/lib/payload'
import { relId, toVideoData, type PostVideoData } from '@/lib/serialize'

// Cap enforced server-side too — encoding minutes are billed, so huge files
// shouldn't rely on the client-side check alone.
const MAX_VIDEO_BYTES = 512 * 1024 * 1024

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
  if (input.size > MAX_VIDEO_BYTES) return { error: 'Video must be under 512MB.' }

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
    const video = await payload.findByID({
      collection: 'videos',
      id: videoId,
      depth: 0,
      overrideAccess: true,
    })
    return toVideoData(video)
  } catch {
    return null
  }
}

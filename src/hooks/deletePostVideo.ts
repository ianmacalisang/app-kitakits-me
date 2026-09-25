import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import type { Payload, PayloadRequest } from 'payload'

import { deleteStreamVideo } from '../lib/bunny'

const videoIdOf = (value: unknown): number | null => {
  if (typeof value === 'object' && value !== null) return (value as { id: number }).id
  return typeof value === 'number' ? value : null
}

// Deletes the video doc and its Bunny Stream file once no post references it
// (mirrors deleteUnreferencedMedia). A failed Bunny call shouldn't block the
// post operation — an orphaned stream can be pruned from the dashboard.
const deleteVideoIfUnreferenced = async (
  payload: Payload,
  videoId: number,
  req?: PayloadRequest,
) => {
  try {
    const stillUsed = await payload.count({
      collection: 'posts',
      where: { video: { equals: videoId } },
      req,
    })
    if (stillUsed.totalDocs > 0) return

    const video = await payload.findByID({
      collection: 'videos',
      id: videoId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    await payload.delete({ collection: 'videos', id: videoId, overrideAccess: true, req })
    if (video.bunnyVideoId) await deleteStreamVideo(video.bunnyVideoId).catch(() => {})
  } catch (err) {
    payload.logger.error({ err, msg: 'Failed to delete unreferenced post video' })
  }
}

export const deletePostVideo: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const videoId = videoIdOf(doc?.video)
  if (videoId !== null) await deleteVideoIfUnreferenced(req.payload, videoId, req)
}

// Covers a video removed while editing a post.
export const deleteRemovedPostVideo: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update') return
  const prev = videoIdOf(previousDoc?.video)
  const next = videoIdOf(doc?.video)
  if (prev !== null && prev !== next) await deleteVideoIfUnreferenced(req.payload, prev, req)
}

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import type { Payload, PayloadRequest } from 'payload'

const mediaIdsOf = (value: unknown): number[] =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map((v) => (typeof v === 'object' && v !== null ? (v as { id: number }).id : Number(v)))
    .filter((v) => Number.isFinite(v))

// Deletes media docs that nothing else references — the storage adapter
// then removes the files from UploadThing. Media still attached to another
// post or a user (avatar, cover, about image) is kept. Exported for the
// account-deletion cascade, which calls it without a PayloadRequest.
export const deleteUnreferencedMedia = async (
  payload: Payload,
  mediaIds: number[],
  req?: PayloadRequest,
) => {
  if (mediaIds.length === 0) return

  try {
    const keep = new Set<number>()

    const posts = await payload.find({
      collection: 'posts',
      where: { image: { in: mediaIds } },
      limit: 0,
      depth: 0,
      select: { image: true },
      req,
    })
    for (const post of posts.docs) {
      for (const mediaId of mediaIdsOf(post.image)) keep.add(mediaId)
    }

    const users = await payload.find({
      collection: 'users',
      where: {
        or: [
          { avatar: { in: mediaIds } },
          { cover: { in: mediaIds } },
          { 'about.image': { in: mediaIds } },
        ],
      },
      limit: 0,
      depth: 0,
      select: { avatar: true, cover: true, about: true },
      req,
    })
    for (const user of users.docs) {
      for (const mediaId of [...mediaIdsOf(user.avatar), ...mediaIdsOf(user.cover)]) {
        keep.add(mediaId)
      }
      for (const block of user.about ?? []) {
        if (block.blockType === 'image') {
          for (const mediaId of mediaIdsOf(block.image)) keep.add(mediaId)
        }
      }
    }

    const orphaned = mediaIds.filter((mediaId) => !keep.has(mediaId))
    if (orphaned.length > 0) {
      await payload.delete({
        collection: 'media',
        where: { id: { in: orphaned } },
        req,
      })
    }
  } catch (err) {
    // A failed cleanup (e.g. UploadThing unreachable) shouldn't block the
    // post operation — orphaned media can be pruned later.
    payload.logger.error({ err, msg: 'Failed to delete unreferenced post media' })
  }
}

export const deletePostMedia: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await deleteUnreferencedMedia(req.payload, mediaIdsOf(doc?.image), req)
}

// Covers images removed while editing a post — media dropped from the
// post's image list is cleaned up the same way.
export const deleteRemovedPostMedia: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update') return
  const kept = new Set(mediaIdsOf(doc?.image))
  const removed = mediaIdsOf(previousDoc?.image).filter((mediaId) => !kept.has(mediaId))
  await deleteUnreferencedMedia(req.payload, removed, req)
}

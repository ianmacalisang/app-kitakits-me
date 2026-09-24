import type { CollectionBeforeDeleteHook, Where } from 'payload'

// Deleting a post cascades to everything that references it — share posts
// (whose sharedPost points here), comments, likes and notifications —
// because the foreign keys would otherwise reject the delete.
export const deletePostDependents: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const shares = await req.payload.find({
    collection: 'posts',
    where: { sharedPost: { equals: id } },
    limit: 0,
    depth: 0,
    req,
  })
  const postIds = [id, ...shares.docs.map((share) => share.id)]

  const comments = await req.payload.find({
    collection: 'comments',
    where: { post: { in: postIds } },
    limit: 0,
    depth: 0,
    req,
  })
  const commentIds = comments.docs.map((comment) => comment.id)

  const notificationOr: Where[] = [{ post: { in: postIds } }]
  if (commentIds.length > 0) notificationOr.push({ comment: { in: commentIds } })

  await req.payload.delete({
    collection: 'notifications',
    where: { or: notificationOr },
    req,
  })
  await req.payload.delete({
    collection: 'comments',
    where: { post: { in: postIds } },
    req,
  })
  await req.payload.delete({
    collection: 'likes',
    where: { post: { in: postIds } },
    req,
  })
  await req.payload.delete({
    collection: 'saves',
    where: { post: { in: postIds } },
    req,
  })
  await req.payload.delete({
    collection: 'posts',
    where: { sharedPost: { equals: id } },
    req,
  })
}

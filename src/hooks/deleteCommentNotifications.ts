import type { CollectionBeforeDeleteHook } from 'payload'

// Notifications pointing at a comment block its delete through the foreign
// key, so remove them first.
export const deleteCommentNotifications: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'notifications',
    where: { comment: { equals: id } },
    req,
  })
}

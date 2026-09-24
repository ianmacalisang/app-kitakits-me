import type { CollectionAfterChangeHook } from 'payload'

import { revalidateNavCounts } from '../lib/nav-cache'

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'object' && value !== null) {
    return Number((value as { id: number | string }).id)
  }
  return null
}

export const createLikeNotification: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
}) => {
  if (operation !== 'create') return

  const postId = idOf(doc.post)
  const actorId = idOf(doc.user)
  if (!postId || !actorId) return

  const post = await req.payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 0,
    req,
  })
  const recipientId = idOf(post.author)
  if (!recipientId || recipientId === actorId) return

  await req.payload.create({
    collection: 'notifications',
    data: {
      recipient: recipientId,
      actor: actorId,
      type: 'like',
      post: postId,
    },
    req,
  })

  revalidateNavCounts(recipientId)
}

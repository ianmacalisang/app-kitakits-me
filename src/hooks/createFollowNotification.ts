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

export const createFollowNotification: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
}) => {
  if (operation !== 'create') return

  const recipientId = idOf(doc.following)
  const actorId = idOf(doc.follower)
  if (!recipientId || !actorId || recipientId === actorId) return

  await req.payload.create({
    collection: 'notifications',
    data: {
      recipient: recipientId,
      actor: actorId,
      type: 'follow',
    },
    req,
  })

  revalidateNavCounts(recipientId)
}

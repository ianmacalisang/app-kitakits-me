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

// New testimonial → notify the recipient there's one awaiting approval.
// Pending/rejected → approved transition → notify the author it went live.
export const createTestimonialNotification: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  const authorId = idOf(doc.author)
  const recipientId = idOf(doc.recipient)
  if (!authorId || !recipientId) return

  const target =
    operation === 'create'
      ? { recipient: recipientId, actor: authorId }
      : operation === 'update' && previousDoc?.status !== 'approved' && doc.status === 'approved'
        ? { recipient: authorId, actor: recipientId }
        : null
  if (!target || target.recipient === target.actor) return

  await req.payload.create({
    collection: 'notifications',
    data: {
      recipient: target.recipient,
      actor: target.actor,
      type: 'testimonial',
      testimonial: doc.id,
    },
    req,
  })

  revalidateNavCounts(target.recipient)

  // The pending-testimonial badge lives on the recipient's nav — invalidate it
  // whenever a pending doc appears or leaves that state (approve/reject).
  if (doc.status === 'pending' || previousDoc?.status === 'pending') {
    revalidateNavCounts(recipientId)
  }
}

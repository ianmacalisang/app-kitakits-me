import type { CollectionBeforeDeleteHook } from 'payload'

import { revalidateNavCounts } from '../lib/nav-cache'
import { relId } from '../lib/serialize'

// Notifications pointing at a testimonial block its delete through the
// foreign key, so remove them first.
export const deleteTestimonialNotifications: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const doc = await req.payload
    .findByID({ collection: 'testimonials', id, depth: 0, req, overrideAccess: true })
    .catch(() => null)

  await req.payload.delete({
    collection: 'notifications',
    where: { testimonial: { equals: id } },
    req,
  })

  // Deleting a pending testimonial drops the recipient's nav badge count.
  const recipientId = relId(doc?.recipient)
  if (doc?.status === 'pending' && recipientId) revalidateNavCounts(recipientId)
}

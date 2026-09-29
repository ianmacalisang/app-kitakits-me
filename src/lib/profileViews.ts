import type { Payload } from 'payload'

import type { User } from '@/payload-types'

const findPairRow = (payload: Payload, viewer: User, viewedUserId: number) =>
  payload.find({
    collection: 'profile-views',
    where: {
      and: [{ viewer: { equals: viewer.id } }, { viewed: { equals: viewedUserId } }],
    },
    limit: 1,
    depth: 0,
    user: viewer,
    overrideAccess: false,
  })

// Upserts the (viewer, viewed) row — first view creates it, later views bump
// updatedAt + viewCount so the activity resurfaces. Recording only happens
// while the viewer has "Who viewed your profile" enabled; the same flag is
// what shows them their own viewers, keeping the feature reciprocal.
export async function recordProfileView(
  payload: Payload,
  viewer: User,
  viewedUserId: number,
): Promise<void> {
  if (!viewer.profileViewTracking || viewer.id === viewedUserId) return

  const existing = await findPairRow(payload, viewer, viewedUserId)
  const row = existing.docs[0]
  if (row) {
    await payload.update({
      collection: 'profile-views',
      id: row.id,
      data: { viewCount: (row.viewCount ?? 0) + 1 },
      user: viewer,
      overrideAccess: false,
    })
    return
  }

  try {
    await payload.create({
      collection: 'profile-views',
      data: { viewer: viewer.id, viewed: viewedUserId },
      user: viewer,
      overrideAccess: false,
    })
  } catch (err) {
    // A concurrent first view may have won the unique-index race — if the
    // pair row exists now, just bump it. Anything else (e.g. a viewed user
    // that doesn't exist) is a real failure and propagates.
    const retried = await findPairRow(payload, viewer, viewedUserId)
    const dup = retried.docs[0]
    if (!dup) throw err
    await payload.update({
      collection: 'profile-views',
      id: dup.id,
      data: { viewCount: (dup.viewCount ?? 0) + 1 },
      user: viewer,
      overrideAccess: false,
    })
  }
}

import { revalidateTag, unstable_cache } from 'next/cache'

import { getPayloadClient } from './payload'

const tag = (userId: number) => `nav:${userId}`

// Cached per user. Invalidated whenever their unread counts change
// (notification created/read, thread synced/read). Falls back to a 5-minute
// TTL as a safety net against any missed invalidation.
export const getCachedNavBadgeCounts = (userId: number) =>
  unstable_cache(
    async () => {
      const payload = await getPayloadClient()
      const [unread, unreadMail] = await Promise.all([
        payload.count({
          collection: 'notifications',
          where: {
            and: [{ recipient: { equals: userId } }, { read: { equals: false } }],
          },
          overrideAccess: true,
        }),
        payload.count({
          collection: 'threads',
          where: {
            and: [{ visibleTo: { contains: userId } }, { unreadFor: { contains: userId } }],
          },
          overrideAccess: true,
        }),
      ])
      return { unread: unread.totalDocs, unreadMail: unreadMail.totalDocs }
    },
    [`nav-counts-${userId}`],
    { tags: [tag(userId)], revalidate: 300 },
  )()

// expire: 0 — never serve stale badge counts; the next request blocks until
// fresh data is fetched. Badge accuracy matters more than latency here.
export const revalidateNavCounts = (userId: number) => revalidateTag(tag(userId), { expire: 0 })

import { revalidateTag, unstable_cache } from 'next/cache'

import { pushLive } from './live'
import { getPayloadClient } from './payload'

const tag = (userId: number) => `nav:${userId}`

// Uncached read — used by the nav polling action, which exists to catch
// counts that didn't trip an explicit invalidation.
export const fetchNavBadgeCounts = async (userId: number) => {
  const payload = await getPayloadClient()
  const [unread, unreadMail, pendingTestimonials] = await Promise.all([
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
    payload.count({
      collection: 'testimonials',
      where: {
        and: [{ recipient: { equals: userId } }, { status: { equals: 'pending' } }],
      },
      overrideAccess: true,
    }),
  ])
  return {
    unread: unread.totalDocs,
    unreadMail: unreadMail.totalDocs,
    pendingTestimonials: pendingTestimonials.totalDocs,
  }
}

// Cached per user. Invalidated whenever their unread counts change
// (notification created/read, thread synced/read). Falls back to a 5-minute
// TTL as a safety net against any missed invalidation.
export const getCachedNavBadgeCounts = (userId: number) =>
  unstable_cache(() => fetchNavBadgeCounts(userId), [`nav-counts-${userId}`], {
    tags: [tag(userId)],
    revalidate: 300,
  })()

// expire: 0 — never serve stale badge counts; the next request blocks until
// fresh data is fetched. Badge accuracy matters more than latency here.
// Swallow the failure when there's no Next.js request context (tests,
// scripts, queued jobs) — invalidation is best-effort, never worth failing
// the underlying mutation.
export const revalidateNavCounts = (userId: number) => {
  try {
    revalidateTag(tag(userId), { expire: 0 })
  } catch {}
  // Push a ping over the socket so open tabs bump badges instantly — the
  // client refetches through getNavBadgeCounts, which reads the just-
  // invalidated cache above.
  pushLive(userId, { type: 'badges' })
}

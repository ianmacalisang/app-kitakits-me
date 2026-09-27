'use server'

import { getCurrentUser } from '@/lib/auth'
import { getCachedNavBadgeCounts } from '@/lib/nav-cache'

// Polled by AppNav on an interval so badges pick up new notifications/mail/
// testimonials without waiting for a navigation or server re-render. Uses the
// cached counts — every mutation that changes them calls revalidateNavCounts,
// and the 5-minute TTL catches any invalidation that slipped through, so the
// uncached fetch would only buy a few seconds of freshness at 3 count queries
// per user per tick.
export async function getNavBadgeCounts() {
  const user = await getCurrentUser()
  if (!user) return null
  return getCachedNavBadgeCounts(user.id)
}

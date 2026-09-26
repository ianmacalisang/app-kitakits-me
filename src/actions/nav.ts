'use server'

import { getCurrentUser } from '@/lib/auth'
import { fetchNavBadgeCounts } from '@/lib/nav-cache'

// Polled by AppNav on an interval so badges pick up new notifications/mail/
// testimonials without waiting for a navigation or server re-render.
export async function getNavBadgeCounts() {
  const user = await getCurrentUser()
  if (!user) return null
  return fetchNavBadgeCounts(user.id)
}

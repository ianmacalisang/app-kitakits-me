'use server'

import { redirect } from 'next/navigation'

import {
  computeActivitiesFingerprint,
  getFollowingActivities,
  type ActivitiesPage,
} from '@/lib/activities'
import { getCurrentUser } from '@/lib/auth'
import { getFollowGraph } from '@/lib/followGraph'
import { getPayloadClient } from '@/lib/payload'

// Page-N fetches N*PAGE_SIZE rows per source — cap the window so a crafted
// page param can't fan the query out unboundedly. Past the cap the feed ends.
const MAX_ACTIVITY_PAGE = 50

export async function loadMoreActivities(page: number): Promise<ActivitiesPage> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const safePage = Math.trunc(page)
  if (!Number.isFinite(safePage) || safePage < 1 || safePage > MAX_ACTIVITY_PAGE) {
    return { items: [], hasMore: false, fingerprint: '0|0' }
  }

  const payload = await getPayloadClient()
  const graph = await getFollowGraph(payload, user)
  return getFollowingActivities(user, graph, safePage)
}

// Cheap freshness probe — the client calls this on tab activation / poll and
// only pays for loadMoreActivities(1) when the fingerprint moved.
export async function getActivitiesFingerprint(): Promise<{ fingerprint: string }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const { authorIds } = await getFollowGraph(payload, user)
  return { fingerprint: await computeActivitiesFingerprint(user, authorIds) }
}

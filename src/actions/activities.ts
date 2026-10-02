'use server'

import { redirect } from 'next/navigation'
import type { Payload } from 'payload'

import {
  computeActivitiesFingerprint,
  getFollowingActivities,
  type ActivitiesPage,
} from '@/lib/activities'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { relId } from '@/lib/serialize'
import type { User } from '@/payload-types'

// Same 2000-followee cap the home feed uses.
async function followeeIds(payload: Payload, user: User): Promise<number[]> {
  const following = await payload.find({
    collection: 'follows',
    where: { follower: { equals: user.id } },
    limit: 2000,
    depth: 0,
    pagination: false,
    user,
    overrideAccess: false,
  })
  return following.docs.map((f) => relId(f.following)).filter((id): id is number => id !== null)
}

export async function loadMoreActivities(page: number): Promise<ActivitiesPage> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const authorIds = await followeeIds(payload, user)
  return getFollowingActivities(user, authorIds, page)
}

// Cheap freshness probe — the client calls this on tab activation / poll and
// only pays for loadMoreActivities(1) when the fingerprint moved.
export async function getActivitiesFingerprint(): Promise<{ fingerprint: string }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const authorIds = await followeeIds(payload, user)
  return { fingerprint: await computeActivitiesFingerprint(user, authorIds) }
}

'use server'

import { redirect } from 'next/navigation'

import { getFollowingActivities } from '@/lib/activities'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { type ActivityData, type Paged, relId } from '@/lib/serialize'

export async function loadMoreActivities(page: number): Promise<Paged<ActivityData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  // Same 2000-followee cap the home feed uses.
  const following = await payload.find({
    collection: 'follows',
    where: { follower: { equals: user.id } },
    limit: 2000,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const authorIds = following.docs
    .map((f) => relId(f.following))
    .filter((id): id is number => id !== null)

  return getFollowingActivities(user, authorIds, page)
}

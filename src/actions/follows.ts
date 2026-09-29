'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getTopBadgesForUsers } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import { type Paged, relId, toUserCardData, type UserCardData } from '@/lib/serialize'
import type { User } from '@/payload-types'

export async function toggleFollow(
  targetUserId: number,
): Promise<{ following: boolean; followers: number }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  const existing = await payload.find({
    collection: 'follows',
    where: {
      and: [{ follower: { equals: user.id } }, { following: { equals: targetUserId } }],
    },
    limit: 1,
    depth: 0,
    user,
    overrideAccess: false,
  })

  let following: boolean
  if (existing.docs[0]) {
    await payload.delete({
      collection: 'follows',
      id: existing.docs[0].id,
      user,
      overrideAccess: false,
    })
    following = false
  } else {
    await payload.create({
      collection: 'follows',
      data: { follower: user.id, following: targetUserId },
      user,
      overrideAccess: false,
    })
    following = true
  }

  const followers = await payload.count({
    collection: 'follows',
    where: { following: { equals: targetUserId } },
    user,
    overrideAccess: false,
  })

  return { following, followers: followers.totalDocs }
}

// Batch-follow used by onboarding — skips anyone already followed and returns
// the ids that were actually followed.
export async function followMany(targetUserIds: number[]): Promise<{ followedIds: number[] }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const ids = [...new Set(targetUserIds)].filter(
    (id) => Number.isInteger(id) && id > 0 && id !== user.id,
  )
  if (ids.length === 0) return { followedIds: [] }

  const payload = await getPayloadClient()

  const existing = await payload.find({
    collection: 'follows',
    where: {
      and: [{ follower: { equals: user.id } }, { following: { in: ids } }],
    },
    limit: 0,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const already = new Set(existing.docs.map((follow) => relId(follow.following)))

  const followedIds: number[] = []
  for (const id of ids) {
    if (already.has(id)) continue
    try {
      await payload.create({
        collection: 'follows',
        data: { follower: user.id, following: id },
        user,
        overrideAccess: false,
      })
      followedIds.push(id)
    } catch {
      // Race with another follow — treat as already followed.
      followedIds.push(id)
    }
  }

  return { followedIds }
}

export async function getFollowList(
  targetUserId: number,
  kind: 'followers' | 'following',
  page = 1,
  query?: string,
): Promise<Paged<UserCardData>> {
  const user = await getCurrentUser()
  const payload = await getPayloadClient()

  // Signed-out viewers may only browse the connections of users who opted
  // into a public profile — everyone else gets sent to login.
  if (!user) {
    const target = await payload.findByID({ collection: 'users', id: targetUserId, depth: 0 })
    if (!target?.publicProfile || target.isPrivate) redirect('/login')
  }

  // Optional name/username filter, applied to the person on the other side
  // of the follow relationship.
  const personField = kind === 'followers' ? 'follower' : 'following'
  const q = query?.trim()

  const follows = await payload.find({
    collection: 'follows',
    where: {
      and: [
        kind === 'followers'
          ? { following: { equals: targetUserId } }
          : { follower: { equals: targetUserId } },
        ...(q
          ? [
              {
                or: [
                  { [`${personField}.name`]: { contains: q } },
                  { [`${personField}.username`]: { contains: q } },
                ],
              },
            ]
          : []),
      ],
    },
    sort: '-createdAt',
    page,
    limit: 30,
    depth: 2,
    // Anonymous reads run with access overridden — the publicProfile check
    // above is the gate. Signed-in users keep normal access control.
    ...(user ? { user, overrideAccess: false } : {}),
  })

  const people = follows.docs
    .map((follow) => (kind === 'followers' ? follow.follower : follow.following))
    .filter((doc): doc is User => typeof doc === 'object' && doc !== null)

  const ids = people.map((person) => person.id)
  const followingIds = new Set<number>()
  if (user) {
    const myFollows = await payload.find({
      collection: 'follows',
      where: {
        and: [{ follower: { equals: user.id } }, { following: { in: ids } }],
      },
      limit: 0,
      depth: 0,
      user,
      overrideAccess: false,
    })
    for (const follow of myFollows.docs) {
      followingIds.add(
        typeof follow.following === 'object' ? follow.following.id : follow.following,
      )
    }
  }

  const topBadges = await getTopBadgesForUsers(payload, ids)

  return {
    items: people.map((person) =>
      toUserCardData(
        person,
        user,
        followingIds.has(person.id),
        undefined,
        topBadges.get(person.id),
      ),
    ),
    hasMore: follows.hasNextPage,
  }
}

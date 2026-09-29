import { getPayloadClient } from '@/lib/payload'
import { avatarUrl, relId } from '@/lib/serialize'
import type { User } from '@/payload-types'

export interface MutualHead {
  id: number
  name: string
  username: string
  avatarUrl: string | null
}

// Everyone the viewer follows who also follows back — the audience for live
// chat and the mutuals strip. Capped at 200; beyond that the strip/section
// just shows the most recent 200.
export async function getMutuals(user: User): Promise<MutualHead[]> {
  const payload = await getPayloadClient()

  const [following, followers] = await Promise.all([
    payload.find({
      collection: 'follows',
      where: { follower: { equals: user.id } },
      limit: 2000,
      depth: 0,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'follows',
      where: { following: { equals: user.id } },
      limit: 2000,
      depth: 0,
      user,
      overrideAccess: false,
    }),
  ])

  const followerIds = new Set(
    followers.docs.map((f) => relId(f.follower)).filter((id): id is number => id !== null),
  )
  const mutualIds = following.docs
    .map((f) => relId(f.following))
    .filter((id): id is number => id !== null && followerIds.has(id))
  if (mutualIds.length === 0) return []

  const docs = await payload.find({
    collection: 'users',
    where: { id: { in: mutualIds } },
    limit: 200,
    depth: 1,
    user,
    overrideAccess: false,
  })

  return docs.docs.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    avatarUrl: avatarUrl(u) ?? null,
  }))
}

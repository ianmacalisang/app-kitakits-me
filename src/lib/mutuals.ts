import { getPayloadClient } from '@/lib/payload'
import { avatarUrl, relId } from '@/lib/serialize'
import type { User } from '@/payload-types'

export interface MutualHead {
  id: number
  name: string
  username: string
  avatarUrl: string | null
}

export interface MutualsPage {
  items: MutualHead[]
  /** Total mutuals across all pages. */
  total: number
  hasMore: boolean
}

export const MUTUALS_PAGE_SIZE = 24

// Everyone the viewer follows who also follows back — the audience for live
// chat, the mutuals strip, and invite pickers. The intersection can't be
// expressed as one DB query, so the follow lists are loaded as plain id rows
// (cheap) and only the requested page's users are hydrated. Order is the
// follow's recency — deterministic so pages can't overlap or skip.
export async function getMutuals(
  user: User,
  page = 1,
  limit = MUTUALS_PAGE_SIZE,
): Promise<MutualsPage> {
  const payload = await getPayloadClient()

  const [following, followers] = await Promise.all([
    payload.find({
      collection: 'follows',
      where: { follower: { equals: user.id } },
      sort: '-createdAt',
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
  const mutualIds = [
    ...new Set(
      following.docs
        .map((f) => relId(f.following))
        .filter((id): id is number => id !== null && followerIds.has(id)),
    ),
  ]
  const total = mutualIds.length
  const hasMore = page * limit < total
  const slice = mutualIds.slice((page - 1) * limit, page * limit)
  if (slice.length === 0) return { items: [], total, hasMore }

  const docs = await payload.find({
    collection: 'users',
    where: { id: { in: slice } },
    limit: slice.length,
    depth: 1,
    user,
    overrideAccess: false,
  })

  // `id in` returns arbitrary order — restore the recency order of the slice.
  const byId = new Map(docs.docs.map((u) => [u.id, u]))
  const items = slice
    .map((id) => byId.get(id))
    .filter((u): u is User => Boolean(u))
    .map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      avatarUrl: avatarUrl(u) ?? null,
    }))

  return { items, total, hasMore }
}

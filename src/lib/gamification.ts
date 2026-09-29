import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import type { Badge, UserBadge } from '@/payload-types'

import { levelForPoints } from './levels'
import type { BadgeData, BadgeProgressData, GamificationData } from './serialize'
import { drizzleOf } from './db'

// Point economy — the amount each ledger event is worth. Received-side
// events (someone engaging with your content) pay the post/profile owner;
// authored-side events reward the actor. Dedupe keys, not value tuning, are
// what stop farming.
export const POINT_VALUES = {
  post: 10,
  comment: 5,
  'like-received': 2,
  'comment-received': 3,
  'share-received': 4,
  'save-received': 2,
  'follow-received': 5,
  'testimonial-received': 10,
  'testimonial-given': 5,
  manual: 0,
} as const

export type PointKind = keyof typeof POINT_VALUES

export { levelForPoints, type LevelInfo } from './levels'

const isDuplicate = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string; data?: { errors?: { path?: string }[] } }
  if (e.code === '23505') return true
  if (Array.isArray(e.data?.errors) && e.data!.errors!.some((x) => x.path === 'key')) return true
  return typeof e.message === 'string' && e.message.toLowerCase().includes('duplicate')
}

type Ctx = { payload: Payload; req?: PayloadRequest; context?: Record<string, unknown> }

// Atomically bump the denormalized balance. Runs on the pool (not the
// caller's transaction) for the same reason bumpPostCounter does — a rolled
// back mutation can drift the display by a few points, the backfill recount
// self-heals.
const bumpUserPoints = async (payload: Payload, userId: number, delta: number): Promise<void> => {
  const db = drizzleOf(payload)
  if (!db || !Number.isFinite(userId) || userId <= 0) return
  await db
    .execute(
      sql.raw(
        `UPDATE users SET points = GREATEST(0, points + ${Math.trunc(delta)}) WHERE id = ${Math.trunc(userId)}`,
      ),
    )
    .catch(() => {})
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'object' && value !== null) {
    const id = Number((value as { id: number | string }).id)
    return Number.isFinite(id) ? id : null
  }
  return null
}

// Awards points for one engagement event. `key` is the dedupe key — if a
// ledger row with that key already exists the insert throws and the whole
// award is a no-op, so callers never double-pay (e.g. unlike → re-like).
// The balance bump + badge evaluation live in the point-events afterChange
// hook, so admin-created 'manual' adjustments get the same treatment.
// Never throws: gamification failing must never break the action that
// triggered it.
export const awardPoints = async (
  { payload, req }: Ctx,
  {
    userId,
    kind,
    key,
    postId,
  }: { userId: number | null | undefined; kind: PointKind; key: string; postId?: number | null },
): Promise<void> => {
  try {
    if (!userId || userId <= 0) return
    const points = POINT_VALUES[kind]
    if (!points) return

    await payload.create({
      collection: 'point-events',
      data: {
        user: userId,
        kind,
        points,
        key,
        ...(postId ? { post: postId } : {}),
      },
      req,
    })
  } catch (err) {
    // Unique conflict on `key` = already awarded — expected, not an error.
    if (!isDuplicate(err)) {
      payload.logger.error({ err, msg: 'awardPoints failed', userId, kind })
    }
  }
}

// Point-events afterChange — the single place ledger rows take effect:
// bump the denormalized balance, then re-evaluate badges against the fresh
// total. Covers hook-driven awards AND manual admin inserts alike.
export const applyPointEvent = async (
  { payload, req }: Ctx,
  event: { user: unknown; points: number },
): Promise<void> => {
  const userId = idOf(event.user)
  if (!userId) return
  await bumpUserPoints(payload, userId, event.points)
  await evaluateBadges({ payload, req }, userId)
}

type BadgeRule = NonNullable<Badge['rule']>

// Counts the stat backing each auto rule for one user — only runs the
// queries for rules with unawarded badges.
const statForRule = async (
  { payload, req }: Ctx,
  userId: number,
  rule: BadgeRule,
  user: { points?: number | null; avatar?: unknown; bio?: string | null },
): Promise<number> => {
  switch (rule) {
    case 'posts':
      return (
        await payload.count({ collection: 'posts', where: { author: { equals: userId } }, req })
      ).totalDocs
    case 'comments':
      return (
        await payload.count({ collection: 'comments', where: { author: { equals: userId } }, req })
      ).totalDocs
    case 'likes-received':
      return (
        await payload.count({
          collection: 'likes',
          where: { 'post.author': { equals: userId } },
          req,
        })
      ).totalDocs
    case 'followers':
      return (
        await payload.count({
          collection: 'follows',
          where: { following: { equals: userId } },
          req,
        })
      ).totalDocs
    case 'testimonials':
      return (
        await payload.count({
          collection: 'testimonials',
          where: {
            and: [{ recipient: { equals: userId } }, { status: { equals: 'approved' } }],
          },
          req,
        })
      ).totalDocs
    case 'points':
      return user.points ?? 0
    case 'profile-complete':
      return user.avatar && (user.bio ?? '').trim() ? 1 : 0
    default:
      return 0
  }
}

// Grants every enabled non-manual badge the user qualifies for but doesn't
// have yet. Idempotent via the (user, badge) unique index — safe to call
// after every award. Notifications fire from the user-badges afterChange
// hook, which also covers manual admin grants.
export const evaluateBadges = async (
  { payload, req, context }: Ctx,
  userId: number,
): Promise<void> => {
  try {
    if (!userId || userId <= 0) return

    const [user, badges, existing] = await Promise.all([
      payload.findByID({ collection: 'users', id: userId, depth: 0, req }),
      payload.find({
        collection: 'badges',
        where: {
          and: [{ enabled: { not_equals: false } }, { rule: { not_equals: 'manual' } }],
        },
        limit: 200,
        depth: 0,
        req,
      }),
      payload.find({
        collection: 'user-badges',
        where: { user: { equals: userId } },
        limit: 500,
        depth: 0,
        req,
      }),
    ])
    if (!user) return

    const awarded = new Set(existing.docs.map((doc) => idOf(doc.badge)))
    const pending = badges.docs.filter((badge) => !awarded.has(badge.id))
    if (pending.length === 0) return

    // One stat per rule, shared by every badge using that rule.
    const stats = new Map<BadgeRule, number>()
    for (const badge of pending) {
      const rule = badge.rule as BadgeRule
      if (!stats.has(rule)) {
        stats.set(rule, await statForRule({ payload, req }, userId, rule, user))
      }
      const threshold =
        badge.rule === 'profile-complete' ? 1 : (badge.threshold ?? Number.MAX_SAFE_INTEGER)
      if ((stats.get(rule) ?? 0) < threshold) continue

      try {
        await payload.create({
          collection: 'user-badges',
          data: { user: userId, badge: badge.id },
          req,
          context,
        })
      } catch (err) {
        if (!isDuplicate(err)) {
          payload.logger.error({ err, msg: 'Badge grant failed', userId, badge: badge.slug })
        }
      }
    }
  } catch (err) {
    payload.logger.error({ err, msg: 'evaluateBadges failed', userId })
  }
}

// One user-badges query for a whole page of actors — returns each user's
// "top" badge (lowest definition sort, earliest earned breaks ties), which is
// what every name-adjacent BadgeMark renders.
export const getTopBadgesForUsers = async (
  payload: Payload,
  userIds: number[],
): Promise<Map<number, BadgeData>> => {
  const ids = [...new Set(userIds)].filter((id) => Number.isFinite(id) && id > 0)
  const map = new Map<number, BadgeData>()
  if (ids.length === 0) return map

  const awards = await payload.find({
    collection: 'user-badges',
    where: { user: { in: ids } },
    limit: Math.max(ids.length * 10, 100),
    depth: 1,
    overrideAccess: true,
  })

  const sortOf = (award: UserBadge) =>
    typeof award.badge === 'object' && award.badge ? ((award.badge as Badge).sort ?? 0) : 0
  awards.docs.sort((a, b) => sortOf(a) - sortOf(b) || a.createdAt.localeCompare(b.createdAt))
  // First match per user wins — the list is already in shelf order.
  for (const award of awards.docs) {
    const userId = idOf(award.user)
    if (!userId || map.has(userId)) continue
    const data = toBadgeData(award)
    if (data) map.set(userId, data)
  }
  return map
}

export const toBadgeData = (award: UserBadge): BadgeData | null => {
  const badge = award.badge
  if (!badge || typeof badge !== 'object') return null
  const b = badge as Badge
  return {
    slug: b.slug,
    name: b.name,
    description: b.description ?? null,
    icon: b.icon ?? 'medal',
    tier: b.tier === 'silver' || b.tier === 'gold' ? b.tier : 'bronze',
    awardedAt: award.createdAt,
  }
}

// Everything a profile needs to render the level chip + badge shelf. Two
// queries — the user's balance and their awards joined to definitions.
export const getUserGamification = async (
  payload: Payload,
  userId: number,
): Promise<GamificationData> => {
  const [user, awards] = await Promise.all([
    payload.findByID({ collection: 'users', id: userId, depth: 0 }),
    payload.find({
      collection: 'user-badges',
      where: { user: { equals: userId } },
      limit: 100,
      depth: 1,
    }),
  ])

  const points = user?.points ?? 0
  const badges = awards.docs
    .slice()
    // Definition order first, earliest earned breaks ties.
    .sort((a, b) => {
      const sortOf = (award: UserBadge) =>
        typeof award.badge === 'object' && award.badge ? ((award.badge as Badge).sort ?? 0) : 0
      return sortOf(a) - sortOf(b) || a.createdAt.localeCompare(b.createdAt)
    })
    .map(toBadgeData)
    .filter((b): b is BadgeData => b !== null)

  return { points, level: levelForPoints(points), badges }
}

// Noun the progress bar counts toward — "7 / 10 followers" etc.
const RULE_UNIT: Record<BadgeRule, string> = {
  posts: 'posts',
  comments: 'comments',
  'likes-received': 'likes',
  followers: 'followers',
  testimonials: 'testimonials',
  points: 'pts',
  'profile-complete': '',
  manual: '',
}

// The user's earned badges joined to their definitions — powers the badge
// panel above the profile tabs. Two queries, no per-rule stat counting.
export const getBadgeProgressForUser = async (
  payload: Payload,
  userId: number,
): Promise<BadgeProgressData[]> => {
  const [badges, existing] = await Promise.all([
    payload.find({
      collection: 'badges',
      where: { enabled: { not_equals: false } },
      sort: 'sort',
      limit: 200,
      depth: 0,
    }),
    payload.find({
      collection: 'user-badges',
      where: { user: { equals: userId } },
      limit: 500,
      depth: 0,
    }),
  ])

  const awarded = new Map(existing.docs.map((doc) => [idOf(doc.badge), doc.createdAt]))

  const rows: BadgeProgressData[] = []
  for (const badge of badges.docs) {
    const earnedAt = awarded.get(badge.id)
    if (!earnedAt) continue
    const rule = (badge.rule ?? 'manual') as BadgeRule
    const required =
      rule === 'manual' ? null : badge.rule === 'profile-complete' ? 1 : (badge.threshold ?? 0)

    rows.push({
      slug: badge.slug,
      name: badge.name,
      description: badge.description ?? null,
      icon: badge.icon ?? 'medal',
      tier: badge.tier === 'silver' || badge.tier === 'gold' ? badge.tier : 'bronze',
      earned: true,
      awardedAt: earnedAt,
      current: required ?? 0,
      required,
      unit: RULE_UNIT[rule],
    })
  }
  return rows
}

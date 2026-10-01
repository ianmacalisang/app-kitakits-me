import type { Where } from 'payload'

import type {
  CardRoom,
  Comment,
  Follow,
  HangoutJoin,
  Like,
  NhieRoom,
  Post,
  ProfileView,
  Testimonial,
  User,
  UserBadge,
  VideokeRoom,
} from '@/payload-types'

import { getTopBadgesForUsers, toBadgeData } from './gamification'
import { getPayloadClient } from './payload'
import { hydratePosts } from './posts'
import {
  type ActivityData,
  type BadgeData,
  type Paged,
  avatarUrl,
  relId,
  snippet,
} from './serialize'

const ACTIVITY_PAGE_SIZE = 20

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isUser = (value: unknown): value is User => isObj(value)

const isPost = (value: unknown): value is Post => isObj(value)

const asUser = (value: unknown): User | null => (isUser(value) ? value : null)

const asPost = (value: unknown): Post | null => (isPost(value) ? value : null)

type BadgeMap = Map<number, BadgeData>

const badgeFor = (badges: BadgeMap | null, user: User | null | undefined) =>
  user ? badges?.get(user.id) : undefined

const actorFields = (actor: User, badges: BadgeMap | null) => ({
  actorName: actor.name,
  actorUsername: actor.username,
  actorAvatarUrl: avatarUrl(actor),
  actorBadge: badgeFor(badges, actor),
})

const postFields = (post: Post, badges: BadgeMap | null) => {
  const author = asUser(post.author)
  return {
    postId: post.id,
    postSnippet: snippet(post),
    postAuthorName: author?.name,
    postAuthorUsername: author?.username,
    postAuthorBadge: badgeFor(badges, author),
  }
}

const toLikeActivity = (like: Like, badges: BadgeMap | null): ActivityData | null => {
  const actor = asUser(like.user)
  const post = asPost(like.post)
  if (!actor || !post) return null
  return {
    id: `like-${like.id}`,
    type: 'like',
    createdAt: like.createdAt,
    ...actorFields(actor, badges),
    ...postFields(post, badges),
  }
}

const toCommentActivity = (comment: Comment, badges: BadgeMap | null): ActivityData | null => {
  const actor = asUser(comment.author)
  const post = asPost(comment.post)
  if (!actor || !post) return null
  return {
    id: `comment-${comment.id}`,
    type: 'comment',
    createdAt: comment.createdAt,
    ...actorFields(actor, badges),
    ...postFields(post, badges),
    commentSnippet: snippet(comment),
  }
}

const toFollowActivity = (follow: Follow, badges: BadgeMap | null): ActivityData | null => {
  const actor = asUser(follow.follower)
  const target = asUser(follow.following)
  if (!actor || !target) return null
  return {
    id: `follow-${follow.id}`,
    type: 'follow',
    createdAt: follow.createdAt,
    ...actorFields(actor, badges),
    targetName: target.name,
    targetUsername: target.username,
    targetAvatarUrl: avatarUrl(target),
    targetBadge: badgeFor(badges, target),
  }
}

const toTestimonialActivity = (
  testimonial: Testimonial,
  badges: BadgeMap | null,
): ActivityData | null => {
  const actor = asUser(testimonial.author)
  const target = asUser(testimonial.recipient)
  if (!actor || !target) return null
  return {
    id: `testimonial-${testimonial.id}`,
    type: 'testimonial',
    createdAt: testimonial.createdAt,
    ...actorFields(actor, badges),
    targetName: target.name,
    targetUsername: target.username,
    targetAvatarUrl: avatarUrl(target),
    targetBadge: badgeFor(badges, target),
    testimonialSnippet: snippet(testimonial),
  }
}

const toBadgeActivity = (award: UserBadge, badges: BadgeMap | null): ActivityData | null => {
  const actor = asUser(award.user)
  const badgeEarned = toBadgeData(award)
  if (!actor || !badgeEarned) return null
  return {
    id: `badge-${award.id}`,
    type: 'badge',
    createdAt: award.createdAt,
    ...actorFields(actor, badges),
    badgeEarned,
  }
}

const toProfileViewActivity = (view: ProfileView, badges: BadgeMap | null): ActivityData | null => {
  const actor = asUser(view.viewer)
  if (!actor) return null
  return {
    id: `profileview-${view.id}`,
    type: 'profile_view',
    // updatedAt is the latest visit — re-views resurface the row.
    createdAt: view.updatedAt,
    ...actorFields(actor, badges),
  }
}

const toHangoutJoinActivity = (
  join: HangoutJoin,
  heads: Map<number, User>,
  rooms: Map<number, VideokeRoom>,
  cardRooms: Map<number, CardRoom>,
  nhieRooms: Map<number, NhieRoom>,
  badges: BadgeMap | null,
): ActivityData | null => {
  const actor = heads.get(relId(join.user) ?? -1) ?? null
  // A join targets exactly one hangout app — whichever FK is set.
  const videoke = rooms.get(relId(join.room) ?? -1) ?? null
  const cards = cardRooms.get(relId(join.cardRoom) ?? -1) ?? null
  const nhie = nhieRooms.get(relId(join.nhieRoom) ?? -1) ?? null
  const room = videoke ?? cards ?? nhie
  if (!actor || !room) return null
  // The member who invited them shows as the activity's target — "hosted by".
  const inviter = heads.get(relId(join.invitedBy) ?? -1) ?? null
  const name = typeof room.name === 'string' && room.name.trim() ? room.name.trim() : undefined
  return {
    id: `hangoutjoin-${join.id}`,
    type: 'hangout_join',
    // updatedAt is the latest join — re-joins resurface the row.
    createdAt: join.updatedAt,
    ...actorFields(actor, badges),
    targetName: inviter?.name,
    targetUsername: inviter?.username,
    targetAvatarUrl: inviter ? avatarUrl(inviter) : undefined,
    targetBadge: badgeFor(badges, inviter),
    videokeRoomId: videoke?.id,
    videokeRoomName: videoke ? name : undefined,
    cardRoomId: cards?.id,
    cardRoomName: cards ? name : undefined,
    nhieRoomId: nhie?.id,
    nhieRoomName: nhie ? name : undefined,
    hangoutJoinKind: join.kind === 'hosted' ? 'hosted' : 'joined',
    hangoutKind: nhie ? 'nhie' : cards ? 'cards' : 'videoke',
  }
}

// Latest likes, comments, and follows made by the given users, plus profile
// views aimed at the viewer — powers the home "Activities" tab. Each source
// is sorted newest-first, so fetching the top page*PAGE_SIZE of each and
// re-merging yields the correct merged page.
// Likes and comments are filtered to posts the viewer can read, matching the
// visibility rules canReadPosts/canReadComments enforce; follow activities
// only surface non-private targets; testimonial activities are limited to
// approved ones (pending/rejected are private to the pair) and canReadTestimonials
// still applies recipient-profile visibility on top. Profile views are
// personal (viewed = the feed owner, not limited to followed actors) and
// only show while the owner has profile-view tracking on, listing viewers
// who still have it on too.
export async function getFollowingActivities(
  viewer: User,
  authorIds: number[],
  page: number,
): Promise<Paged<ActivityData>> {
  const optedIn = Boolean(viewer.profileViewTracking)
  if (authorIds.length === 0 && !optedIn) return { items: [], hasMore: false }

  const payload = await getPayloadClient()
  const limit = page * ACTIVITY_PAGE_SIZE
  const allowed = [viewer.id, ...authorIds]

  const visiblePost: Where = {
    or: [
      {
        and: [
          { 'post.visibility': { not_equals: 'followers' } },
          { 'post.author.isPrivate': { not_equals: true } },
        ],
      },
      { 'post.author': { in: allowed } },
    ],
  }

  const [likes, comments, follows, testimonials, badgeAwards, profileViews, hangoutJoins] =
    await Promise.all([
      // Depth 3 so the embedded post is fully usable by hydratePosts: post
      // images (2), the post author's avatar (3), and a shared original's
      // author (3) all come back populated.
      payload.find({
        collection: 'likes',
        where: { and: [{ user: { in: authorIds } }, visiblePost] },
        sort: '-createdAt',
        limit,
        depth: 3,
        user: viewer,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'comments',
        where: { and: [{ author: { in: authorIds } }, visiblePost] },
        sort: '-createdAt',
        limit,
        depth: 3,
        user: viewer,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'follows',
        where: {
          and: [{ follower: { in: authorIds } }, { 'following.isPrivate': { not_equals: true } }],
        },
        sort: '-createdAt',
        limit,
        depth: 2,
        user: viewer,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'testimonials',
        where: { and: [{ author: { in: authorIds } }, { status: { equals: 'approved' } }] },
        sort: '-createdAt',
        limit,
        depth: 2,
        user: viewer,
        overrideAccess: false,
      }),
      // Badge awards are public celebration moments — no visibility filter.
      // Depth 2 populates the badge definition for toBadgeData.
      payload.find({
        collection: 'user-badges',
        where: { user: { in: authorIds } },
        sort: '-createdAt',
        limit,
        depth: 2,
        user: viewer,
        overrideAccess: false,
      }),
      // Who viewed the feed owner's profile — reciprocal: rows only exist for
      // opted-in viewers, and a viewer who later opts out drops off the list.
      optedIn
        ? payload.find({
            collection: 'profile-views',
            where: {
              and: [
                { viewed: { equals: viewer.id } },
                { 'viewer.profileViewTracking': { equals: true } },
              ],
            },
            sort: '-updatedAt',
            limit,
            depth: 2,
            user: viewer,
            overrideAccess: false,
          })
        : Promise.resolve({ docs: [] as ProfileView[], hasNextPage: false }),
      // Hangout joins by followed users — sorted by updatedAt because a
      // re-join bumps the existing row instead of creating a new one. Depth 0:
      // the room/user heads hydrate separately below with system access —
      // a follower isn't a room party, so access-checked population would
      // leave join.room as a bare id and the row would drop from the feed.
      payload.find({
        collection: 'hangout-joins',
        where: { user: { in: authorIds } },
        sort: '-updatedAt',
        limit,
        depth: 0,
        user: viewer,
        overrideAccess: false,
      }),
    ])

  const joinUserIds = new Set<number>()
  const joinRoomIds = new Set<number>()
  const joinCardRoomIds = new Set<number>()
  const joinNhieRoomIds = new Set<number>()
  for (const join of hangoutJoins.docs) {
    const uid = relId(join.user)
    const iid = relId(join.invitedBy)
    const rid = relId(join.room)
    const cid = relId(join.cardRoom)
    const nid = relId(join.nhieRoom)
    if (uid) joinUserIds.add(uid)
    if (iid) joinUserIds.add(iid)
    if (rid) joinRoomIds.add(rid)
    if (cid) joinCardRoomIds.add(cid)
    if (nid) joinNhieRoomIds.add(nid)
  }
  const [joinHeads, joinRooms, joinCardRooms, joinNhieRooms] = await Promise.all([
    joinUserIds.size
      ? payload.find({
          collection: 'users',
          where: { id: { in: [...joinUserIds] } },
          limit: joinUserIds.size,
          // Depth 1 so avatar media populates — avatarUrl needs the Media doc.
          depth: 1,
          overrideAccess: true,
        })
      : { docs: [] as User[] },
    joinRoomIds.size
      ? payload.find({
          collection: 'videoke-rooms',
          where: { id: { in: [...joinRoomIds] } },
          limit: joinRoomIds.size,
          depth: 0,
          overrideAccess: true,
        })
      : { docs: [] as VideokeRoom[] },
    joinCardRoomIds.size
      ? payload.find({
          collection: 'card-rooms',
          where: { id: { in: [...joinCardRoomIds] } },
          limit: joinCardRoomIds.size,
          depth: 0,
          overrideAccess: true,
        })
      : { docs: [] as CardRoom[] },
    joinNhieRoomIds.size
      ? payload.find({
          collection: 'nhie-rooms',
          where: { id: { in: [...joinNhieRoomIds] } },
          limit: joinNhieRoomIds.size,
          depth: 0,
          overrideAccess: true,
        })
      : { docs: [] as NhieRoom[] },
  ])
  const joinUserMap = new Map(joinHeads.docs.map((u) => [u.id, u]))
  const joinRoomMap = new Map(joinRooms.docs.map((r) => [r.id, r]))
  const joinCardRoomMap = new Map(joinCardRooms.docs.map((r) => [r.id, r]))
  const joinNhieRoomMap = new Map(joinNhieRooms.docs.map((r) => [r.id, r]))

  // One badge lookup for every named user — actors, post authors, and targets.
  const badgeUserIds = new Set<number>()
  const collect = (...users: (User | null)[]) => {
    for (const u of users) if (u) badgeUserIds.add(u.id)
  }
  for (const like of likes.docs) collect(asUser(like.user), asUser(asPost(like.post)?.author))
  for (const comment of comments.docs)
    collect(asUser(comment.author), asUser(asPost(comment.post)?.author))
  for (const follow of follows.docs) collect(asUser(follow.follower), asUser(follow.following))
  for (const testimonial of testimonials.docs)
    collect(asUser(testimonial.author), asUser(testimonial.recipient))
  for (const award of badgeAwards.docs) collect(asUser(award.user))
  for (const view of profileViews.docs) collect(asUser(view.viewer))
  for (const join of hangoutJoins.docs)
    collect(
      joinUserMap.get(relId(join.user) ?? -1) ?? null,
      joinUserMap.get(relId(join.invitedBy) ?? -1) ?? null,
    )
  const topBadges = await getTopBadgesForUsers(payload, [...badgeUserIds])

  const entries = [
    ...likes.docs.map((like) => ({
      data: toLikeActivity(like, topBadges),
      post: asPost(like.post),
    })),
    ...comments.docs.map((comment) => ({
      data: toCommentActivity(comment, topBadges),
      post: asPost(comment.post),
    })),
    ...follows.docs.map((follow) => ({ data: toFollowActivity(follow, topBadges), post: null })),
    ...testimonials.docs.map((testimonial) => ({
      data: toTestimonialActivity(testimonial, topBadges),
      post: null,
    })),
    ...badgeAwards.docs.map((award) => ({
      data: toBadgeActivity(award, topBadges),
      post: null,
    })),
    ...profileViews.docs.map((view) => ({
      data: toProfileViewActivity(view, topBadges),
      post: null,
    })),
    ...hangoutJoins.docs.map((join) => ({
      data: toHangoutJoinActivity(
        join,
        joinUserMap,
        joinRoomMap,
        joinCardRoomMap,
        joinNhieRoomMap,
        topBadges,
      ),
      post: null,
    })),
  ]
    .filter((e): e is { data: ActivityData; post: Post | null } => e.data !== null)
    .sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt))

  const start = (page - 1) * ACTIVITY_PAGE_SIZE
  const pageEntries = entries.slice(start, start + ACTIVITY_PAGE_SIZE)
  const hasMore =
    entries.length > start + ACTIVITY_PAGE_SIZE ||
    likes.hasNextPage ||
    comments.hasNextPage ||
    follows.hasNextPage ||
    testimonials.hasNextPage ||
    badgeAwards.hasNextPage ||
    profileViews.hasNextPage ||
    hangoutJoins.hasNextPage

  // Hydrate the distinct posts shown on this page in one batched pass so each
  // like/comment row can render the full post card, not just a snippet.
  const postDocs = new Map<number, Post>()
  for (const entry of pageEntries) {
    if (entry.post) postDocs.set(entry.post.id, entry.post)
  }
  const cards = new Map(
    (await hydratePosts([...postDocs.values()], viewer)).map((card) => [card.id, card]),
  )

  const items = pageEntries.map((entry) =>
    entry.post ? { ...entry.data, post: cards.get(entry.post.id) } : entry.data,
  )

  return { items, hasMore }
}

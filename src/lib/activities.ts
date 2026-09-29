import type { Where } from 'payload'

import type {
  Comment,
  Follow,
  Like,
  Post,
  ProfileView,
  Testimonial,
  User,
  UserBadge,
} from '@/payload-types'

import { getTopBadgesForUsers, toBadgeData } from './gamification'
import { getPayloadClient } from './payload'
import { hydratePosts } from './posts'
import { type ActivityData, type BadgeData, type Paged, avatarUrl, snippet } from './serialize'

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

  const [likes, comments, follows, testimonials, badgeAwards, profileViews] = await Promise.all([
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
  ])

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
    profileViews.hasNextPage

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

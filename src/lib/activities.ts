import type { Where } from 'payload'

import type { Comment, Follow, Like, Post, Testimonial, User } from '@/payload-types'

import { getPayloadClient } from './payload'
import { hydratePosts } from './posts'
import { type ActivityData, type Paged, avatarUrl, snippet } from './serialize'

const ACTIVITY_PAGE_SIZE = 20

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isUser = (value: unknown): value is User => isObj(value)

const isPost = (value: unknown): value is Post => isObj(value)

const asUser = (value: unknown): User | null => (isUser(value) ? value : null)

const asPost = (value: unknown): Post | null => (isPost(value) ? value : null)

const actorFields = (actor: User) => ({
  actorName: actor.name,
  actorUsername: actor.username,
  actorAvatarUrl: avatarUrl(actor),
})

const postFields = (post: Post) => {
  const author = asUser(post.author)
  return {
    postId: post.id,
    postSnippet: snippet(post),
    postAuthorName: author?.name,
    postAuthorUsername: author?.username,
  }
}

const toLikeActivity = (like: Like): ActivityData | null => {
  const actor = asUser(like.user)
  const post = asPost(like.post)
  if (!actor || !post) return null
  return {
    id: `like-${like.id}`,
    type: 'like',
    createdAt: like.createdAt,
    ...actorFields(actor),
    ...postFields(post),
  }
}

const toCommentActivity = (comment: Comment): ActivityData | null => {
  const actor = asUser(comment.author)
  const post = asPost(comment.post)
  if (!actor || !post) return null
  return {
    id: `comment-${comment.id}`,
    type: 'comment',
    createdAt: comment.createdAt,
    ...actorFields(actor),
    ...postFields(post),
    commentSnippet: snippet(comment),
  }
}

const toFollowActivity = (follow: Follow): ActivityData | null => {
  const actor = asUser(follow.follower)
  const target = asUser(follow.following)
  if (!actor || !target) return null
  return {
    id: `follow-${follow.id}`,
    type: 'follow',
    createdAt: follow.createdAt,
    ...actorFields(actor),
    targetName: target.name,
    targetUsername: target.username,
    targetAvatarUrl: avatarUrl(target),
  }
}

const toTestimonialActivity = (testimonial: Testimonial): ActivityData | null => {
  const actor = asUser(testimonial.author)
  const target = asUser(testimonial.recipient)
  if (!actor || !target) return null
  return {
    id: `testimonial-${testimonial.id}`,
    type: 'testimonial',
    createdAt: testimonial.createdAt,
    ...actorFields(actor),
    targetName: target.name,
    targetUsername: target.username,
    targetAvatarUrl: avatarUrl(target),
    testimonialSnippet: snippet(testimonial),
  }
}

// Latest likes, comments, and follows made by the given users — powers the
// home "Activities" tab. Each source is sorted newest-first, so fetching the
// top page*PAGE_SIZE of each and re-merging yields the correct merged page.
// Likes and comments are filtered to posts the viewer can read, matching the
// visibility rules canReadPosts/canReadComments enforce; follow activities
// only surface non-private targets; testimonial activities are limited to
// approved ones (pending/rejected are private to the pair) and canReadTestimonials
// still applies recipient-profile visibility on top.
export async function getFollowingActivities(
  viewer: User,
  authorIds: number[],
  page: number,
): Promise<Paged<ActivityData>> {
  if (authorIds.length === 0) return { items: [], hasMore: false }

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

  const [likes, comments, follows, testimonials] = await Promise.all([
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
  ])

  const entries = [
    ...likes.docs.map((like) => ({ data: toLikeActivity(like), post: asPost(like.post) })),
    ...comments.docs.map((comment) => ({
      data: toCommentActivity(comment),
      post: asPost(comment.post),
    })),
    ...follows.docs.map((follow) => ({ data: toFollowActivity(follow), post: null })),
    ...testimonials.docs.map((testimonial) => ({
      data: toTestimonialActivity(testimonial),
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
    testimonials.hasNextPage

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

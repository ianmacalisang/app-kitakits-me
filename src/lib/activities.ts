import type { Where } from 'payload'

import type { Comment, Follow, Like, Post, User } from '@/payload-types'

import { getPayloadClient } from './payload'
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

// Latest likes, comments, and follows made by the given users — powers the
// home "Activities" tab. Each source is sorted newest-first, so fetching the
// top page*PAGE_SIZE of each and re-merging yields the correct merged page.
// Likes and comments are filtered to posts the viewer can read, matching the
// visibility rules canReadPosts/canReadComments enforce; follow activities
// only surface non-private targets.
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

  const [likes, comments, follows] = await Promise.all([
    payload.find({
      collection: 'likes',
      where: { and: [{ user: { in: authorIds } }, visiblePost] },
      sort: '-createdAt',
      limit,
      depth: 2,
      user: viewer,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'comments',
      where: { and: [{ author: { in: authorIds } }, visiblePost] },
      sort: '-createdAt',
      limit,
      depth: 2,
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
  ])

  const activities: ActivityData[] = [
    ...likes.docs.map(toLikeActivity),
    ...comments.docs.map(toCommentActivity),
    ...follows.docs.map(toFollowActivity),
  ]
    .filter((a): a is ActivityData => a !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const start = (page - 1) * ACTIVITY_PAGE_SIZE
  const items = activities.slice(start, start + ACTIVITY_PAGE_SIZE)
  const hasMore =
    activities.length > start + ACTIVITY_PAGE_SIZE ||
    likes.hasNextPage ||
    comments.hasNextPage ||
    follows.hasNextPage

  return { items, hasMore }
}

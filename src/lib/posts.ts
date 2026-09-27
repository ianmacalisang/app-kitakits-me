import type { Where } from 'payload'

import type { Media, Post, User, Video } from '@/payload-types'

import { isPostCategory, type PostCategory } from './categories'
import { getPayloadClient } from './payload'
import {
  avatarUrl,
  type EmbeddedPostData,
  type MediaFilter,
  mediaUrl,
  type PostCardData,
  relId,
  toPostCardData,
  toVideoData,
} from './serialize'

export const FEED_PAGE_SIZE = 20

// Where-clauses restricting a feed to posts carrying media — powers the
// feed filter dropdown ('all' adds nothing, 'media' accepts either kind).
export function mediaFilterClauses(mediaFilter?: MediaFilter): Where[] {
  switch (mediaFilter) {
    case 'images':
      return [{ image: { exists: true } }]
    case 'videos':
      return [{ video: { exists: true } }]
    case 'media':
      return [{ or: [{ image: { exists: true } }, { video: { exists: true } }] }]
    default:
      return []
  }
}

// Where-clauses restricting a feed to one post category. 'kwento' also
// matches posts with no category set — the serializer presents uncategorized
// posts as Kwento (the default), so the filter must treat them the same way.
export function categoryFilterClauses(category?: PostCategory | 'all'): Where[] {
  if (!category || !isPostCategory(category)) return []
  if (category === 'kwento') {
    return [{ or: [{ category: { equals: 'kwento' } }, { category: { exists: false } }] }]
  }
  return [{ category: { equals: category } }]
}

// Where-clauses restricting a feed to posts a signed-out reader may see —
// mirrors the anonymous constraint in canReadPosts. Powers public surfaces
// (Discover, public profiles) for anonymous and signed-in viewers alike.
export function publicPostClauses(): Where[] {
  return [{ visibility: { not_equals: 'followers' } }, { 'author.isPrivate': { not_equals: true } }]
}

// Posts the viewer has saved, most recently saved first — powers the home
// "Saved" tab. Saves are paginated first, then the posts are fetched in one
// query and reordered to match save order; posts the viewer can no longer see
// (deleted, made private/followers-only) drop out of the page.
export async function getSavedPosts(
  viewer: User,
  page: number,
): Promise<{ posts: PostCardData[]; hasMore: boolean; total: number }> {
  const payload = await getPayloadClient()
  const saves = await payload.find({
    collection: 'saves',
    where: { user: { equals: viewer.id } },
    sort: '-createdAt',
    page,
    limit: FEED_PAGE_SIZE,
    depth: 0,
    user: viewer,
    overrideAccess: false,
  })

  const postIds = saves.docs
    .map((save) => relId(save.post))
    .filter((id): id is number => id !== null)
  if (postIds.length === 0) return { posts: [], hasMore: saves.hasNextPage, total: saves.totalDocs }

  const result = await payload.find({
    collection: 'posts',
    where: { id: { in: postIds } },
    limit: postIds.length,
    depth: 2,
    user: viewer,
    overrideAccess: false,
  })

  const byId = new Map(result.docs.map((post) => [post.id, post]))
  const docs = postIds.map((id) => byId.get(id)).filter((post): post is Post => Boolean(post))

  return {
    posts: await hydratePosts(docs, viewer),
    hasMore: saves.hasNextPage,
    total: saves.totalDocs,
  }
}

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isUser = (value: unknown): value is User => isObj(value)

// Attaches engagement data to a set of posts with batched queries (rather than
// N+1 lookups per post): like/comment/share counts, the viewer's like & share
// state, recent liker avatars, the two latest comments, and embedded originals
// for share posts.
export async function hydratePosts(docs: Post[], viewer: User | null): Promise<PostCardData[]> {
  if (docs.length === 0) return []

  const payload = await getPayloadClient()
  const postIds = docs.map((post) => post.id)

  // At depth 2 a share's embedded author is populated but that author's avatar
  // is only an ID — collect them for one batched media lookup.
  const embeddedAvatarIds: number[] = []
  for (const post of docs) {
    if (isObj(post.sharedPost) && isUser(post.sharedPost.author)) {
      const avatarId = relId(post.sharedPost.author.avatar)
      if (avatarId !== null) embeddedAvatarIds.push(avatarId)
    }
  }

  // Each batch cap is generous enough to give accurate counts at realistic
  // scale while preventing runaway queries on viral posts. Adjust as needed.
  const batchSize = postIds.length
  const LIKES_CAP = Math.max(1000, batchSize * 200) // ≥1000, scales with batch
  const COMMENTS_CAP = Math.max(500, batchSize * 50)
  const SHARES_CAP = Math.max(500, batchSize * 50)
  const SAVES_CAP = Math.max(500, batchSize * 50)

  const [likes, comments, shares, saves, avatarMedia] = await Promise.all([
    payload.find({
      collection: 'likes',
      where: { post: { in: postIds } },
      sort: '-createdAt',
      limit: LIKES_CAP,
      depth: 2,
      select: { post: true, user: true },
    }),
    payload.find({
      collection: 'comments',
      where: { post: { in: postIds } },
      sort: '-createdAt',
      limit: COMMENTS_CAP,
      depth: 2,
      select: { post: true, author: true, content: true },
    }),
    payload.find({
      collection: 'posts',
      where: { sharedPost: { in: postIds } },
      limit: SHARES_CAP,
      depth: 0,
      select: { sharedPost: true, author: true },
    }),
    // All saves on these posts — feeds both the per-post save count and the
    // viewer's own savedByMe flag in one query.
    payload.find({
      collection: 'saves',
      where: { post: { in: postIds } },
      limit: SAVES_CAP,
      depth: 0,
      select: { post: true, user: true },
    }),
    embeddedAvatarIds.length > 0
      ? payload.find({
          collection: 'media',
          where: { id: { in: embeddedAvatarIds } },
          limit: embeddedAvatarIds.length,
          depth: 0,
        })
      : Promise.resolve({ docs: [] as Media[] }),
  ])

  const likeCounts = new Map<number, number>()
  const likedByMe = new Set<number>()
  const likersByPost = new Map<number, PostCardData['likers']>()
  const seenLikers = new Map<number, Set<number>>()
  for (const like of likes.docs) {
    const postId = relId(like.post)
    if (postId === null) continue
    likeCounts.set(postId, (likeCounts.get(postId) ?? 0) + 1)
    if (viewer && relId(like.user) === viewer.id) likedByMe.add(postId)

    // Avatar stack — up to 3 unique users, newest first.
    if (isUser(like.user)) {
      const seen = seenLikers.get(postId) ?? new Set<number>()
      const stack = likersByPost.get(postId) ?? []
      if (!seen.has(like.user.id) && stack.length < 3) {
        seen.add(like.user.id)
        seenLikers.set(postId, seen)
        stack.push({
          name: like.user.name,
          username: like.user.username,
          avatarUrl: avatarUrl(like.user),
        })
        likersByPost.set(postId, stack)
      }
    }
  }

  const commentCounts = new Map<number, number>()
  const latestByPost = new Map<number, PostCardData['latestComments']>()
  for (const comment of comments.docs) {
    const postId = relId(comment.post)
    if (postId === null) continue
    commentCounts.set(postId, (commentCounts.get(postId) ?? 0) + 1)

    // Two most recent comments (fetched newest-first, reversed to display order).
    const list = latestByPost.get(postId) ?? []
    if (list.length < 2 && isUser(comment.author)) {
      list.unshift({
        authorName: comment.author.name,
        authorUsername: comment.author.username,
        authorAvatarUrl: avatarUrl(comment.author),
        content: comment.content,
      })
      latestByPost.set(postId, list)
    }
  }

  const shareCounts = new Map<number, number>()
  const sharedByMe = new Set<number>()
  for (const share of shares.docs) {
    const postId = relId(share.sharedPost)
    if (postId === null) continue
    shareCounts.set(postId, (shareCounts.get(postId) ?? 0) + 1)
    if (viewer && relId(share.author) === viewer.id) sharedByMe.add(postId)
  }

  const saveCounts = new Map<number, number>()
  const savedByMe = new Set<number>()
  for (const save of saves.docs) {
    const postId = relId(save.post)
    if (postId === null) continue
    saveCounts.set(postId, (saveCounts.get(postId) ?? 0) + 1)
    if (viewer && relId(save.user) === viewer.id) savedByMe.add(postId)
  }

  const avatarMap = new Map(avatarMedia.docs.map((m) => [m.id, mediaUrl(m)]))

  return docs.map((post) => {
    let embedded: EmbeddedPostData | undefined
    const shared = isObj(post.sharedPost) ? (post.sharedPost as Post) : null
    // Skip the embed if the original has since been made non-public.
    if (shared && shared.visibility === 'public' && isUser(shared.author)) {
      embedded = {
        id: shared.id,
        authorId: shared.author.id,
        content: shared.content ?? null,
        imageUrls: (Array.isArray(shared.image) ? shared.image : [])
          .filter((m): m is Media => isObj(m))
          .map((m) => mediaUrl(m))
          .filter((u): u is string => Boolean(u)),
        video: isObj(shared.video) ? toVideoData(shared.video as Video) : undefined,
        category: isPostCategory(shared.category) ? shared.category : 'kwento',
        createdAt: shared.createdAt,
        authorName: shared.author.name,
        authorUsername: shared.author.username,
        authorAvatarUrl:
          avatarMap.get(relId(shared.author.avatar) ?? -1) ?? avatarUrl(shared.author),
      }
    }

    return toPostCardData(post, viewer, {
      likeCount: likeCounts.get(post.id) ?? 0,
      commentCount: commentCounts.get(post.id) ?? 0,
      likedByMe: likedByMe.has(post.id),
      likers: likersByPost.get(post.id) ?? [],
      latestComments: latestByPost.get(post.id) ?? [],
      shareCount: shareCounts.get(post.id) ?? 0,
      sharedByMe: sharedByMe.has(post.id),
      sharedPost: embedded,
      savedByMe: savedByMe.has(post.id),
      saveCount: saveCounts.get(post.id) ?? 0,
    })
  })
}

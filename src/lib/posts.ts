import type { Media, Post, User } from '@/payload-types'

import { getPayloadClient } from './payload'
import {
  avatarUrl,
  type EmbeddedPostData,
  mediaUrl,
  type PostCardData,
  relId,
  toPostCardData,
} from './serialize'

export const FEED_PAGE_SIZE = 20

// For You pool size — recent public posts are shuffled out of this pool and
// the shuffled list is paginated, so order stays stable while scrolling.
export const FOR_YOU_POOL = 100

// Deterministic PRNG — the client sends the same seed for every page of a For
// You session, so the shuffled pool paginates consistently across requests.
const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Random public posts for the home "For You" tab — shuffles a pool of recent
// public posts with a client-provided seed so pages stay consistent. Returns
// the seed used so the caller can pass it back on subsequent pages.
//
// Perf: first pass fetches only IDs (depth:0, select:{id:true}) — cheap even
// at FOR_YOU_POOL=100. Second pass fetches only the ~20 posts for this page at
// full depth, avoiding the cost of populating 80 discarded pool entries.
export async function getForYouPosts(
  viewer: User,
  page: number,
  seed = Math.floor(Math.random() * 0x7fffffff),
): Promise<{ posts: PostCardData[]; hasMore: boolean; seed: number }> {
  const payload = await getPayloadClient()

  // Step 1 — lightweight pool fetch for shuffling (depth:0 = no joins).
  // `id` is always returned by Payload and is all we need for the shuffle.
  const pool = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { visibility: { equals: 'public' } },
        { 'author.isPrivate': { not_equals: true } },
        { author: { not_equals: viewer.id } },
      ],
    },
    sort: '-createdAt',
    limit: FOR_YOU_POOL,
    depth: 0,
    user: viewer,
    overrideAccess: false,
  })

  const rand = mulberry32(seed)
  const shuffled = [...pool.docs]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const start = (page - 1) * FEED_PAGE_SIZE
  const pageSlice = shuffled.slice(start, start + FEED_PAGE_SIZE)
  const hasMore = shuffled.length > start + pageSlice.length

  if (pageSlice.length === 0) return { posts: [], hasMore, seed }

  // Step 2 — full-depth fetch for only the posts that will be rendered.
  const pageIds = pageSlice.map((p) => p.id)
  const result = await payload.find({
    collection: 'posts',
    where: { id: { in: pageIds } },
    limit: pageIds.length,
    depth: 2,
    user: viewer,
    overrideAccess: false,
  })

  // Re-apply the shuffled order (the DB result may come back in a different order).
  const byId = new Map(result.docs.map((p) => [p.id, p]))
  const docs = pageIds.map((id) => byId.get(id)).filter((p): p is Post => p !== undefined)

  return {
    posts: await hydratePosts(docs, viewer),
    hasMore,
    seed,
  }
}

// Posts the viewer has saved, most recently saved first — powers the home
// "Saved" tab. Saves are paginated first, then the posts are fetched in one
// query and reordered to match save order; posts the viewer can no longer see
// (deleted, made private/followers-only) drop out of the page.
export async function getSavedPosts(
  viewer: User,
  page: number,
): Promise<{ posts: PostCardData[]; hasMore: boolean }> {
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
  if (postIds.length === 0) return { posts: [], hasMore: saves.hasNextPage }

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

  return { posts: await hydratePosts(docs, viewer), hasMore: saves.hasNextPage }
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
    viewer
      ? payload.find({
          collection: 'saves',
          where: {
            and: [{ post: { in: postIds } }, { user: { equals: viewer.id } }],
          },
          limit: batchSize, // one save per post per viewer at most
          depth: 0,
          select: { post: true },
        })
      : Promise.resolve({ docs: [] as { post?: unknown }[] }),
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

  const savedByMe = new Set<number>()
  for (const save of saves.docs) {
    const postId = relId(save.post)
    if (postId !== null) savedByMe.add(postId)
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
    })
  })
}

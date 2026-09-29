'use server'

import { sql } from '@payloadcms/db-postgres'
import { redirect } from 'next/navigation'
import type { Where } from 'payload'

import { getCurrentUser } from '@/lib/auth'
import { isPostCategory, type PostCategory } from '@/lib/categories'
import { drizzleOf } from '@/lib/db'
import { followerIds, pushLive } from '@/lib/live'
import { getPayloadClient } from '@/lib/payload'
import {
  FEED_PAGE_SIZE,
  categoryFilterClauses,
  getSavedPosts,
  hydratePosts,
  mediaFilterClauses,
  publicPostClauses,
} from '@/lib/posts'
import {
  type MediaFilter,
  type Paged,
  type PostCardData,
  mediaUrl,
  relId,
  toVideoData,
} from '@/lib/serialize'
import type { Media, User, Video } from '@/payload-types'

import type { FormState } from './auth'

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong.'

const MAX_IMAGES = 4

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>

async function uploadImages(
  payload: PayloadClient,
  user: User,
  files: FormDataEntryValue[],
): Promise<number[]> {
  const ids: number[] = []
  for (const entry of files.slice(0, MAX_IMAGES)) {
    if (!(entry instanceof File) || entry.size === 0) continue
    const media = await payload.create({
      collection: 'media',
      data: { alt: entry.name },
      file: {
        data: Buffer.from(await entry.arrayBuffer()),
        mimetype: entry.type,
        name: entry.name,
        size: entry.size,
      },
      user,
      overrideAccess: false,
    })
    ids.push(media.id)
  }
  return ids
}

// Resolves a videos doc ID from form data and confirms it belongs to the
// user — the browser uploads to Bunny directly, so the doc already exists
// by the time the post is created.
async function ownedVideoId(
  payload: PayloadClient,
  user: User,
  value: FormDataEntryValue | null,
): Promise<number | null> {
  const id = Number(value)
  if (!Number.isFinite(id) || id <= 0) return null
  try {
    const video = await payload.findByID({
      collection: 'videos',
      id,
      depth: 0,
      user,
      overrideAccess: false,
    })
    return relId(video.owner) === user.id ? id : null
  } catch {
    return null
  }
}

export async function createPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const content = String(formData.get('content') ?? '').trim()
  const visibility = formData.get('visibility') === 'followers' ? 'followers' : 'public'
  const rawCategory = formData.get('category')
  const category = isPostCategory(rawCategory) ? rawCategory : 'kwento'
  const imageIds = await uploadImages(payload, user, formData.getAll('image'))
  const videoId = await ownedVideoId(payload, user, formData.get('video'))

  try {
    await payload.create({
      collection: 'posts',
      data: {
        author: user.id,
        category,
        content: content || undefined,
        image: imageIds,
        video: videoId,
        visibility,
      },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  // Ping followers over the socket so their live feeds prepend instantly —
  // the hint carries only the author id; each client refetches with its own
  // cursor/filters via getNewerPosts. Deferred (like all pushes) until after
  // the response — see lib/live.
  pushLive(followerIds(payload, user.id), { type: 'feed:new', authorId: user.id })

  return { success: true }
}

export async function updatePost(postId: number, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const content = String(formData.get('content') ?? '').trim()
  const visibility = formData.get('visibility') === 'followers' ? 'followers' : 'public'
  const rawCategory = formData.get('category')
  const category = isPostCategory(rawCategory) ? rawCategory : 'kwento'
  const keepIds = formData
    .getAll('keepImage')
    .map((v) => Number(v))
    .filter((id) => Number.isFinite(id))
  const newIds = await uploadImages(payload, user, formData.getAll('image'))
  const videoId = await ownedVideoId(payload, user, formData.get('video'))

  try {
    await payload.update({
      collection: 'posts',
      id: postId,
      data: {
        category,
        content,
        visibility,
        image: [...keepIds, ...newIds],
        video: videoId,
      },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

// Repost toggle — sharing creates a post whose sharedPost points at the
// original; sharing again deletes it. Only public posts are shareable, and
// sharing a share collapses to the original (retweet semantics).
export async function sharePost(
  postId: number,
): Promise<{ shared?: boolean; count?: number; error?: string }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  let post
  try {
    post = await payload.findByID({
      collection: 'posts',
      id: postId,
      depth: 1,
      user,
      overrideAccess: false,
    })
  } catch {
    return { error: 'Post not found.' }
  }
  if (post.visibility !== 'public') return { error: 'Only public posts can be shared.' }

  const targetId = relId(post.sharedPost) ?? post.id
  let targetAuthorId = relId(post.author)
  if (targetId !== post.id) {
    try {
      const target = await payload.findByID({
        collection: 'posts',
        id: targetId,
        depth: 0,
        user,
        overrideAccess: false,
      })
      if (target.visibility !== 'public') return { error: 'Only public posts can be shared.' }
      targetAuthorId = relId(target.author)
    } catch {
      return { error: 'Post not found.' }
    }
  }
  if (targetAuthorId === user.id) return { error: "You can't share your own post." }

  const existing = await payload.find({
    collection: 'posts',
    where: {
      and: [{ author: { equals: user.id } }, { sharedPost: { equals: targetId } }],
    },
    limit: 1,
    depth: 0,
    user,
    overrideAccess: false,
  })

  let shared: boolean
  if (existing.docs[0]) {
    await payload.delete({
      collection: 'posts',
      id: existing.docs[0].id,
      user,
      overrideAccess: false,
    })
    shared = false
  } else {
    await payload.create({
      collection: 'posts',
      data: { author: user.id, category: 'kwento', sharedPost: targetId, visibility: 'public' },
      user,
      overrideAccess: false,
    })
    shared = true
  }

  // The share counter hooks already bumped the denormalized column on the
  // target — read it off the row instead of recounting share posts.
  const target = await payload.findByID({
    collection: 'posts',
    id: targetId,
    depth: 0,
    overrideAccess: true,
  })

  return { shared, count: target.shareCount ?? 0 }
}

// Pin toggle — only the author can pin, and only original posts (not share
// cards). Pinned posts surface in the Pinned section of the profile Posts tab.
export async function togglePin(postId: number): Promise<{ pinned?: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  let post
  try {
    post = await payload.findByID({
      collection: 'posts',
      id: postId,
      depth: 0,
      user,
      overrideAccess: false,
    })
  } catch {
    return { error: 'Post not found.' }
  }
  if (relId(post.author) !== user.id) return { error: "You can't pin this post." }
  if (post.sharedPost) return { error: "You can't pin a shared post." }
  if (post.visibility === 'followers' && !post.pinned)
    return { error: 'Only public posts can be pinned.' }

  const pinned = !post.pinned
  try {
    await payload.update({
      collection: 'posts',
      id: postId,
      data: { pinned },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { pinned }
}

export async function deletePost(postId: number): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  try {
    await payload.delete({
      collection: 'posts',
      id: postId,
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

// Single hydrated post — used by sheets that show a post outside the feed
// (e.g. tapping a like notification or a Discover card). Signed-out readers
// get the anonymous canReadPosts constraint inline — access control can't
// apply it for them because the nested author.isPrivate path requires read
// permission on the users collection.
export async function getPost(postId: number): Promise<PostCardData | null> {
  const user = await getCurrentUser()

  const payload = await getPayloadClient()
  try {
    const post = user
      ? await payload.findByID({
          collection: 'posts',
          id: postId,
          depth: 2,
          user,
          overrideAccess: false,
        })
      : (
          await payload.find({
            collection: 'posts',
            where: { and: [{ id: { equals: postId } }, ...publicPostClauses()] },
            limit: 1,
            depth: 2,
          })
        ).docs[0]
    if (!post) return null
    const [hydrated] = await hydratePosts([post], user)
    return hydrated ?? null
  } catch {
    return null
  }
}

// Trending pool size — posts are ranked by engagement out of this pool and
// the ranked list is paginated, so order stays stable while scrolling.
const TRENDING_POOL = 60
const TRENDING_PAGE_SIZE = 20

// Engagement score shared by trending and spotlight ranking — comments
// weigh double, shares triple.
const engagementScore = (post: PostCardData) =>
  post.likeCount + post.commentCount * 2 + post.shareCount * 3

// Recent posts with images ranked by engagement — powers the Explore posts
// section when there's no query.
export async function getTrendingPosts(page = 1): Promise<Paged<PostCardData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    where: { or: [{ image: { exists: true } }, { video: { exists: true } }] },
    sort: '-createdAt',
    limit: TRENDING_POOL,
    depth: 2,
    user,
    overrideAccess: false,
  })

  const ranked = (await hydratePosts(result.docs, user)).sort(
    (a, b) => engagementScore(b) - engagementScore(a),
  )

  const start = (page - 1) * TRENDING_PAGE_SIZE
  const items = ranked.slice(start, start + TRENDING_PAGE_SIZE)
  return { items, hasMore: ranked.length > start + items.length }
}

// Posts with the most comments in the last 72 hours — powers the "Hot
// discussions" section on Explore. Ranked by recent activity rather than
// lifetime totals, so a stale thread can't hold the spot forever.
const HOT_DISCUSSIONS_LIMIT = 8

export async function getHotDiscussions(): Promise<PostCardData[]> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const db = drizzleOf(payload)
  if (!db) return []

  type Row = { pid: number; recent: string | number }
  const { rows } = (await db.execute(sql`
    SELECT post_id AS pid, COUNT(*) AS recent
    FROM comments
    WHERE created_at > now() - interval '72 hours'
    GROUP BY post_id
    ORDER BY recent DESC
    LIMIT 30
  `)) as { rows: Row[] }

  const ids = rows.map((row) => row.pid)
  if (ids.length === 0) return []

  const result = await payload.find({
    collection: 'posts',
    where: { and: [{ id: { in: ids } }, ...mediaFilterClauses('media')] },
    limit: ids.length,
    depth: 2,
    user,
    overrideAccess: false,
  })

  const recentById = new Map(rows.map((row) => [row.pid, Number(row.recent)]))
  return (await hydratePosts(result.docs, user))
    .sort((a, b) => (recentById.get(b.id) ?? 0) - (recentById.get(a.id) ?? 0))
    .slice(0, HOT_DISCUSSIONS_LIMIT)
}

// Fresh Tanong posts nobody has answered yet — invites the first reply.
const UNANSWERED_LIMIT = 8

export async function getUnansweredTanong(): Promise<PostCardData[]> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    where: {
      and: [{ category: { equals: 'tanong' } }, { commentCount: { equals: 0 } }],
    },
    sort: '-createdAt',
    limit: UNANSWERED_LIMIT,
    depth: 2,
    user,
    overrideAccess: false,
  })

  return hydratePosts(result.docs, user)
}

export interface CategorySpotlight {
  category: PostCategory
  posts: PostCardData[]
}

// Highest-scoring recent media posts grouped by category — powers the
// "Hot in X" sections on Explore.
const SPOTLIGHT_POOL = 120
const SPOTLIGHT_PER_CATEGORY = 3
const SPOTLIGHT_SECTIONS = 3

export async function getCategorySpotlights(): Promise<CategorySpotlight[]> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    where: { or: [{ image: { exists: true } }, { video: { exists: true } }] },
    sort: '-createdAt',
    limit: SPOTLIGHT_POOL,
    depth: 2,
    user,
    overrideAccess: false,
  })

  const ranked = (await hydratePosts(result.docs, user)).sort(
    (a, b) => engagementScore(b) - engagementScore(a),
  )

  const groups = new Map<PostCategory, PostCardData[]>()
  for (const post of ranked) {
    const category = post.category ?? 'kwento'
    const group = groups.get(category)
    if (!group) groups.set(category, [post])
    else if (group.length < SPOTLIGHT_PER_CATEGORY) group.push(post)
  }

  const groupScore = (posts: PostCardData[]) =>
    posts.reduce((sum, post) => sum + engagementScore(post), 0)

  return [...groups.entries()]
    .filter(([, posts]) => posts.length >= 2)
    .sort((a, b) => groupScore(b[1]) - groupScore(a[1]))
    .slice(0, SPOTLIGHT_SECTIONS)
    .map(([category, posts]) => ({ category, posts }))
}

const HASHTAG_RE = /#([\p{L}\p{N}_]{1,30})/gu
const TAG_POOL = 100

// Most-used hashtags across recent posts — powers the trending chips on
// Explore. Counts posts containing each tag rather than raw occurrences.
export async function getTrendingTags(limit = 8): Promise<string[]> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    where: { content: { contains: '#' } },
    sort: '-createdAt',
    limit: TAG_POOL,
    depth: 0,
    select: { content: true },
    user,
    overrideAccess: false,
  })

  const counts = new Map<string, number>()
  for (const post of result.docs) {
    const tags = new Set<string>()
    for (const match of post.content?.matchAll(HASHTAG_RE) ?? []) {
      const tag = match[1]?.toLowerCase()
      if (tag) tags.add(tag)
    }
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => `#${tag}`)
}

export async function searchPosts(query: string, page = 1): Promise<Paged<PostCardData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const trimmed = query.trim()
  if (!trimmed) return getTrendingPosts(page)

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    where: { content: { contains: trimmed } },
    sort: '-createdAt',
    page,
    limit: 20,
    depth: 2,
    user,
    overrideAccess: false,
  })

  return { items: await hydratePosts(result.docs, user), hasMore: result.hasNextPage }
}

export interface FeedPage {
  posts: PostCardData[]
  hasMore: boolean
}

export interface MediaItem {
  id: number
  postId: number
  url: string
}

export type MediaType = 'images' | 'videos'

// All media a user has posted, newest first — powers the profile Media
// tab's Photos and Videos walls. Videos map to their stream thumbnail.
// `publicOnly` (used by the public profile page) limits to public posts of
// public accounts. Signed-out readers get the same constraint inlined —
// access control can't apply the nested author.isPrivate path for them
// (users read is authenticated-only), and the path can't appear in `where`
// while access is on. Signed-in callers rely on canReadPosts, which scopes
// to posts they may read (own + followed authors' followers-only included).
export async function getUserMedia(
  authorId: number,
  page = 1,
  publicOnly = false,
  mediaType: MediaType = 'images',
): Promise<Paged<MediaItem>> {
  const user = await getCurrentUser()

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { author: { equals: authorId } },
        mediaType === 'videos' ? { video: { exists: true } } : { image: { exists: true } },
        ...(publicOnly || !user ? publicPostClauses() : []),
      ],
    },
    sort: '-createdAt',
    page,
    limit: 30,
    depth: 1,
    select: mediaType === 'videos' ? { video: true } : { image: true },
    // Anonymous queries run with access off — the inline publicPostClauses
    // above is the constraint, evaluated as a plain DB filter like getPost.
    ...(user ? { user, overrideAccess: false as const } : {}),
  })

  const items = result.docs.flatMap((post): MediaItem[] => {
    if (mediaType === 'videos') {
      const video = post.video
      if (typeof video !== 'object' || video === null) return []
      const { id, thumbnailUrl } = toVideoData(video as Video)
      return [{ id, postId: post.id, url: thumbnailUrl }]
    }
    return (Array.isArray(post.image) ? post.image : [])
      .filter((m): m is Media => typeof m === 'object' && m !== null)
      .map((m) => ({ id: m.id, postId: post.id, url: mediaUrl(m) }))
      .filter((i): i is MediaItem => Boolean(i.url))
  })

  return { items, hasMore: result.hasNextPage }
}

// Author scope + media/category filters shared by feed queries — a single
// author's posts or the viewer's followees' posts. Returns null when the
// scope can match nothing (the viewer follows nobody).
async function feedWhere(
  payload: PayloadClient,
  user: User,
  options: { authorId?: number; mediaFilter?: MediaFilter; category?: PostCategory | 'all' },
): Promise<Where | null> {
  const { authorId, mediaFilter, category } = options
  const filters = [...mediaFilterClauses(mediaFilter), ...categoryFilterClauses(category)]
  if (authorId) {
    return { and: [{ author: { equals: authorId } }, ...filters] }
  }
  const following = await payload.find({
    collection: 'follows',
    where: { follower: { equals: user.id } },
    limit: 2000,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const authorIds = following.docs.map((follow) =>
    typeof follow.following === 'object' ? follow.following.id : follow.following,
  )
  if (authorIds.length === 0) return null
  return { and: [{ author: { in: authorIds } }, ...filters] }
}

// Cap for a single "new posts" fetch — a burst beyond this is picked up on
// the next poll, advancing the cursor each time.
const NEW_POSTS_LIMIT = 50

// Posts newer than the feed's current head — powers the live "new posts"
// pill. The (createdAt, id) cursor keeps same-timestamp inserts since ids
// are serial. Saved feeds return empty — save events keep them in sync.
export async function getNewerPosts(options: {
  afterId: number
  afterCreatedAt: string
  authorId?: number
  feed?: 'following' | 'saved'
  mediaFilter?: MediaFilter
  category?: PostCategory | 'all'
}): Promise<FeedPage> {
  const { afterId, afterCreatedAt, authorId, feed, mediaFilter, category } = options
  if (!authorId && feed === 'saved') return { posts: [], hasMore: false }

  const user = await getCurrentUser()
  const payload = await getPayloadClient()

  const fresh: Where = {
    or: [
      { createdAt: { greater_than: afterCreatedAt } },
      { and: [{ createdAt: { equals: afterCreatedAt } }, { id: { greater_than: afterId } }] },
    ],
  }

  let where: Where | null
  let access: { overrideAccess: boolean; user?: User }
  if (user) {
    where = await feedWhere(payload, user, { authorId, mediaFilter, category })
    access = { overrideAccess: false, user }
  } else {
    // Same anonymous constraint as loadMorePosts — only reachable from
    // public-profile feeds.
    if (!authorId) return { posts: [], hasMore: false }
    where = { and: [{ author: { equals: authorId } }, ...publicPostClauses()] }
    access = { overrideAccess: true }
  }
  if (!where) return { posts: [], hasMore: false }

  // Cheap existence check before the hydrated find — polls almost always
  // come back empty, and pushed feed:new events can trigger a burst of
  // refetches that race the cursor.
  const newer = await payload.count({
    collection: 'posts',
    where: { and: [where, fresh] },
    ...access,
  })
  if (newer.totalDocs === 0) return { posts: [], hasMore: false }

  const result = await payload.find({
    collection: 'posts',
    where: { and: [where, fresh] },
    sort: '-createdAt',
    limit: NEW_POSTS_LIMIT,
    depth: 2,
    ...access,
  })

  return { posts: await hydratePosts(result.docs, user), hasMore: false }
}

export async function loadMorePosts(options: {
  page: number
  authorId?: number
  feed?: 'following' | 'saved'
  mediaFilter?: MediaFilter
  category?: PostCategory | 'all'
}): Promise<FeedPage> {
  const user = await getCurrentUser()

  const payload = await getPayloadClient()
  const { page, authorId, feed, mediaFilter, category } = options

  // Signed-out readers only arrive here from public profiles — serve the
  // author's public posts with the same limits anonymous canReadPosts applies.
  if (!user) {
    if (!authorId) return { posts: [], hasMore: false }
    const result = await payload.find({
      collection: 'posts',
      where: {
        and: [{ author: { equals: authorId } }, ...publicPostClauses()],
      },
      sort: '-createdAt',
      page,
      limit: FEED_PAGE_SIZE,
      depth: 2,
    })
    return { posts: await hydratePosts(result.docs, null), hasMore: result.hasNextPage }
  }

  if (!authorId && feed === 'saved') return getSavedPosts(user, page)

  const where = await feedWhere(payload, user, { authorId, mediaFilter, category })
  if (!where) return { posts: [], hasMore: false }

  const result = await payload.find({
    collection: 'posts',
    where,
    sort: '-createdAt',
    page,
    limit: FEED_PAGE_SIZE,
    depth: 2,
    user,
    overrideAccess: false,
  })

  return {
    posts: await hydratePosts(result.docs, user),
    hasMore: result.hasNextPage,
  }
}

'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { isPostCategory, type PostCategory } from '@/lib/categories'
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
// cards). Pinned posts surface in the Pinned section of the profile About tab.
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

  const score = (post: PostCardData) => post.likeCount + post.commentCount * 2 + post.shareCount * 3
  const ranked = (await hydratePosts(result.docs, user)).sort((a, b) => score(b) - score(a))

  const start = (page - 1) * TRENDING_PAGE_SIZE
  const items = ranked.slice(start, start + TRENDING_PAGE_SIZE)
  return { items, hasMore: ranked.length > start + items.length }
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
  const mediaClauses = mediaFilterClauses(mediaFilter)
  const categoryClauses = categoryFilterClauses(category)

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

  let where
  if (authorId) {
    where = { and: [{ author: { equals: authorId } }, ...mediaClauses, ...categoryClauses] }
  } else if (feed === 'saved') {
    return getSavedPosts(user, page)
  } else {
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
    if (authorIds.length === 0) return { posts: [], hasMore: false }
    where = { and: [{ author: { in: authorIds } }, ...mediaClauses, ...categoryClauses] }
  }

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

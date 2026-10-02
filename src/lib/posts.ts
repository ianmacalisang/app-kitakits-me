import { sql } from '@payloadcms/db-postgres'
import type { Where } from 'payload'

import type { Media, Post, User, Video } from '@/payload-types'

import { isPostCategory, type PostCategory } from './categories'
import { drizzleOf } from './db'
import { getTopBadgesForUsers } from './gamification'
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
  return [
    { visibility: { not_in: ['followers', 'mutuals'] } },
    { 'author.isPrivate': { not_equals: true } },
  ]
}

// A short strip of recent public posts for the landing page — same anonymous
// constraint as Discover, plus two tightenings for the front door: original
// posts only (no share cards) and no NSFW category. Uncategorized posts stay
// (they serialize as Kwento), so the exclusion is wrapped in an `or` with
// exists:false — a bare not_equals would drop them too.
export async function getLandingPosts(viewer: User | null, limit = 6): Promise<PostCardData[]> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    where: {
      and: [
        ...publicPostClauses(),
        { sharedPost: { exists: false } },
        { or: [{ category: { exists: false } }, { category: { not_equals: 'nsfw' } }] },
      ],
    },
    sort: '-createdAt',
    limit,
    depth: 2,
    ...(viewer ? { user: viewer, overrideAccess: false as const } : {}),
  })
  return hydratePosts(result.docs, viewer)
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

// Attaches engagement data to a set of posts. Counts read straight off the
// denormalized counter columns on each post row; the only row-level lookups
// are the viewer's own like/save/share state and the top-N likers/commenters
// the cards actually render — bounded regardless of a post's total
// engagement, so a viral post can't drag thousands of rows through hydration.
export async function hydratePosts(docs: Post[], viewer: User | null): Promise<PostCardData[]> {
  if (docs.length === 0) return []

  const payload = await getPayloadClient()
  const postIds = docs.map((post) => post.id)
  const db = drizzleOf(payload)
  const idIn = sql.join(
    postIds.map((id) => sql`${id}`),
    sql`, `,
  )

  // At depth 2 a share's embedded author is populated but that author's avatar
  // is only an ID — collect them for one batched media lookup.
  const embeddedAvatarIds: number[] = []
  for (const post of docs) {
    if (isObj(post.sharedPost) && isUser(post.sharedPost.author)) {
      const avatarId = relId(post.sharedPost.author.avatar)
      if (avatarId !== null) embeddedAvatarIds.push(avatarId)
    }
  }

  type LikerRow = { pid: number; uid: number }
  type CommentRow = { pid: number; uid: number; content: string }

  const [myLikes, mySaves, myShares, likerRows, commentRows, avatarMedia] = await Promise.all([
    viewer
      ? payload.find({
          collection: 'likes',
          where: { and: [{ user: { equals: viewer.id } }, { post: { in: postIds } }] },
          limit: postIds.length,
          depth: 0,
          select: { post: true },
          overrideAccess: true,
        })
      : Promise.resolve(null),
    viewer
      ? payload.find({
          collection: 'saves',
          where: { and: [{ user: { equals: viewer.id } }, { post: { in: postIds } }] },
          limit: postIds.length,
          depth: 0,
          select: { post: true },
          overrideAccess: true,
        })
      : Promise.resolve(null),
    viewer
      ? payload.find({
          collection: 'posts',
          where: { and: [{ author: { equals: viewer.id } }, { sharedPost: { in: postIds } }] },
          limit: postIds.length,
          depth: 0,
          select: { sharedPost: true },
          overrideAccess: true,
        })
      : Promise.resolve(null),
    // Top 3 likers per post — ROW_NUMBER windows keep this at ≤3 rows per
    // post no matter how many likes exist.
    db
      ? (db.execute(sql`
          SELECT post_id AS pid, user_id AS uid FROM (
            SELECT post_id, user_id,
              ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY created_at DESC, id DESC) AS rn
            FROM likes WHERE post_id IN (${idIn})
          ) t WHERE rn <= 3 ORDER BY pid, rn
        `) as Promise<{ rows: LikerRow[] }>)
      : Promise.resolve({ rows: [] as LikerRow[] }),
    // Two most recent comments per post — same windowed bound.
    db
      ? (db.execute(sql`
          SELECT post_id AS pid, author_id AS uid, content FROM (
            SELECT post_id, author_id, content,
              ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY created_at DESC, id DESC) AS rn
            FROM comments WHERE post_id IN (${idIn})
          ) t WHERE rn <= 2 ORDER BY pid, rn
        `) as Promise<{ rows: CommentRow[] }>)
      : Promise.resolve({ rows: [] as CommentRow[] }),
    embeddedAvatarIds.length > 0
      ? payload.find({
          collection: 'media',
          where: { id: { in: embeddedAvatarIds } },
          limit: embeddedAvatarIds.length,
          depth: 0,
        })
      : Promise.resolve({ docs: [] as Media[] }),
  ])

  // One batched lookup for every actor the cards surface (likers + comment
  // authors), depth 1 so avatars come back populated.
  const actorIds = new Set<number>()
  for (const row of likerRows.rows) actorIds.add(row.uid)
  for (const row of commentRows.rows) actorIds.add(row.uid)
  const actors =
    actorIds.size > 0
      ? await payload.find({
          collection: 'users',
          where: { id: { in: [...actorIds] } },
          limit: actorIds.size,
          depth: 1,
          overrideAccess: true,
        })
      : { docs: [] as User[] }
  const actorMap = new Map(actors.docs.map((u) => [u.id, u]))

  const likedByMe = new Set((myLikes?.docs ?? []).map((d) => relId(d.post)))
  const savedByMe = new Set((mySaves?.docs ?? []).map((d) => relId(d.post)))
  const sharedByMe = new Set((myShares?.docs ?? []).map((d) => relId(d.sharedPost)))

  // Avatar stack — up to 3 users per post, newest first (rn is already the
  // newest-first order from the window query).
  const likersByPost = new Map<number, PostCardData['likers']>()
  for (const row of likerRows.rows) {
    const actor = actorMap.get(row.uid)
    if (!actor) continue
    const stack = likersByPost.get(row.pid) ?? []
    stack.push({ name: actor.name, username: actor.username, avatarUrl: avatarUrl(actor) })
    likersByPost.set(row.pid, stack)
  }

  // One badge lookup for every named user on the page — post authors,
  // embedded (shared) authors, and comment authors.
  const badgeUserIds = new Set<number>()
  for (const post of docs) {
    if (isUser(post.author)) badgeUserIds.add(post.author.id)
    if (isObj(post.sharedPost) && isUser(post.sharedPost.author)) {
      badgeUserIds.add(post.sharedPost.author.id)
    }
  }
  for (const row of commentRows.rows) badgeUserIds.add(row.uid)
  const topBadges = await getTopBadgesForUsers(payload, [...badgeUserIds])

  const latestByPost = new Map<number, PostCardData['latestComments']>()
  for (const row of commentRows.rows) {
    const actor = actorMap.get(row.uid)
    if (!actor) continue
    // Rows arrive newest-first; unshift so the older of the two renders first.
    const list = latestByPost.get(row.pid) ?? []
    list.unshift({
      authorName: actor.name,
      authorUsername: actor.username,
      authorAvatarUrl: avatarUrl(actor),
      authorBadge: topBadges.get(actor.id),
      content: row.content,
    })
    latestByPost.set(row.pid, list)
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
        authorBadge: topBadges.get(shared.author.id),
      }
    }

    return toPostCardData(post, viewer, {
      likeCount: post.likeCount ?? 0,
      commentCount: post.commentCount ?? 0,
      authorBadge: isUser(post.author) ? topBadges.get(post.author.id) : undefined,
      likedByMe: likedByMe.has(post.id),
      likers: likersByPost.get(post.id) ?? [],
      latestComments: latestByPost.get(post.id) ?? [],
      shareCount: post.shareCount ?? 0,
      sharedByMe: sharedByMe.has(post.id),
      sharedPost: embedded,
      savedByMe: savedByMe.has(post.id),
      saveCount: post.saveCount ?? 0,
    })
  })
}

import { sql } from '@payloadcms/db-postgres'
import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { User } from '@/payload-types'
import { getFollowingActivities } from '@/lib/activities'
import { drizzleOf } from '@/lib/db'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
let author: User // public post author
let priv: User // private post author — everything on their profile is mutuals-only
let actor: User // the followed user producing like/comment activity
let viewer: User // follows actor only — no mutuals
let mutualViewer: User // follows actor AND is mutual with both authors

let pubPostId: number
let mutualPostId: number
let privatePostId: number

// Server actions pass the session user (which carries `collection`) into
// Local API ops — mirror that shape here.
const asUser = (user: User) => ({ ...user, collection: 'users' as const })

const userIds = () => [author, priv, actor, viewer, mutualViewer].map((u) => u.id)

const makeUser = (stamp: number, name: string, extra: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'users',
    data: {
      email: `act-${name}${stamp}@test.dev`,
      password: 'password123',
      name,
      username: `act${name}${stamp}`.slice(0, 30),
      role: 'user',
      ...extra,
    },
  })

const follow = (follower: User, following: User) =>
  payload.create({
    collection: 'follows',
    data: { follower: follower.id, following: following.id },
  })

describe('Activities feed — post visibility', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    ;[author, priv, actor, viewer, mutualViewer] = (await Promise.all([
      makeUser(stamp, 'author'),
      makeUser(stamp, 'priv', { isPrivate: true }),
      makeUser(stamp, 'actor'),
      makeUser(stamp, 'viewer'),
      makeUser(stamp, 'mutual'),
    ])) as User[]

    // viewer follows actor; mutualViewer follows actor and is mutual with
    // both authors. Actor is mutual with both authors so they may like /
    // comment on restricted posts at all. Sequential creates — each follow
    // spawns hook transactions and the remote pool is small.
    for (const [follower, following] of [
      [viewer, actor],
      [mutualViewer, actor],
      [mutualViewer, author],
      [author, mutualViewer],
      [mutualViewer, priv],
      [priv, mutualViewer],
      [actor, author],
      [author, actor],
      [actor, priv],
      [priv, actor],
    ] as const) {
      await follow(follower, following)
    }

    const [pubPost, mutualPost, privatePost] = [
      await payload.create({
        collection: 'posts',
        draft: false,
        data: { author: author.id, content: 'public post', visibility: 'public', category: 'kwento' },
      }),
      await payload.create({
        collection: 'posts',
        draft: false,
        data: { author: author.id, content: 'mutuals post', visibility: 'mutuals', category: 'kwento' },
      }),
      await payload.create({
        collection: 'posts',
        draft: false,
        data: { author: priv.id, content: 'private account post', visibility: 'public', category: 'kwento' },
      }),
    ]
    pubPostId = pubPost.id
    mutualPostId = mutualPost.id
    privatePostId = privatePost.id
  })

  afterAll(async () => {
    if (!payload || !author) return
    const ids = userIds()
    // FK order: notifications/point-events/user-badges reference everything.
    await payload.delete({
      collection: 'notifications',
      where: { or: [{ recipient: { in: ids } }, { actor: { in: ids } }] },
    })
    await payload.delete({ collection: 'point-events', where: { user: { in: ids } } })
    await payload.delete({ collection: 'user-badges', where: { user: { in: ids } } })
    await payload.delete({ collection: 'likes', where: { user: { in: ids } } })
    await payload.delete({ collection: 'comments', where: { author: { in: ids } } })
    await payload.delete({
      collection: 'follows',
      where: { or: [{ follower: { in: ids } }, { following: { in: ids } }] },
    })
    await payload.delete({ collection: 'posts', where: { author: { in: ids } } })
    for (const user of [author, priv, actor, viewer, mutualViewer]) {
      if (user) await payload.delete({ collection: 'users', id: user.id })
    }
  })

  const viewerFeed = () =>
    getFollowingActivities(asUser(viewer), { authorIds: [actor.id], followerIds: [] }, 1)

  // mutualViewer's real graph shape: followees [actor, author, priv],
  // followers [author, priv] — so mutualAuthorIds includes both authors.
  const mutualFeed = () =>
    getFollowingActivities(
      asUser(mutualViewer),
      {
        authorIds: [actor.id, author.id, priv.id],
        followerIds: [author.id, priv.id],
      },
      1,
    )

  it('surfaces a like on a public post to followers', async () => {
    const like = await payload.create({
      collection: 'likes',
      data: { user: actor.id, post: pubPostId },
    })
    const feed = await viewerFeed()
    const item = feed.items.find((a) => a.id === `like-${like.id}`)
    expect(item?.type).toBe('like')
    expect(item?.actorUsername).toBe(actor.username)
    expect(item?.postId).toBe(pubPostId)
  })

  it('surfaces a comment on a public post to followers', async () => {
    const comment = await payload.create({
      collection: 'comments',
      data: { author: actor.id, post: pubPostId, content: 'nice!' },
    })
    const feed = await viewerFeed()
    const item = feed.items.find((a) => a.id === `comment-${comment.id}`)
    expect(item?.type).toBe('comment')
    expect(item?.commentSnippet).toBe('nice!')
  })

  it('hides activity on mutuals-only posts from non-mutual followers', async () => {
    const like = await payload.create({
      collection: 'likes',
      data: { user: actor.id, post: mutualPostId },
    })
    const comment = await payload.create({
      collection: 'comments',
      data: { author: actor.id, post: mutualPostId, content: 'secret' },
    })
    const feed = await viewerFeed()
    expect(feed.items.some((a) => a.id === `like-${like.id}`)).toBe(false)
    expect(feed.items.some((a) => a.id === `comment-${comment.id}`)).toBe(false)
  })

  it('hides activity on private-account posts from non-mutual followers', async () => {
    const like = await payload.create({
      collection: 'likes',
      data: { user: actor.id, post: privatePostId },
    })
    const comment = await payload.create({
      collection: 'comments',
      data: { author: actor.id, post: privatePostId, content: 'hidden' },
    })
    const feed = await viewerFeed()
    expect(feed.items.some((a) => a.id === `like-${like.id}`)).toBe(false)
    expect(feed.items.some((a) => a.id === `comment-${comment.id}`)).toBe(false)
  })

  it('shows restricted-post activity to mutuals of the author', async () => {
    const feed = await mutualFeed()
    const mutualPostItems = feed.items.filter((a) => a.postId === mutualPostId)
    const privatePostItems = feed.items.filter((a) => a.postId === privatePostId)
    expect(mutualPostItems.some((a) => a.type === 'like')).toBe(true)
    expect(mutualPostItems.some((a) => a.type === 'comment')).toBe(true)
    expect(privatePostItems.some((a) => a.type === 'like')).toBe(true)
    expect(privatePostItems.some((a) => a.type === 'comment')).toBe(true)
  })

  it('drops activity older than the feed window', async () => {
    const oldPost = await payload.create({
      collection: 'posts',
        draft: false,
      data: { author: author.id, content: 'old public post', visibility: 'public', category: 'kwento' },
    })
    const oldLike = await payload.create({
      collection: 'likes',
      data: { user: actor.id, post: oldPost.id },
    })
    // Backdate beyond the 30-day window — timestamps are auto-set on create.
    const db = drizzleOf(payload)
    expect(db).toBeTruthy()
    await db!.execute(
      sql`UPDATE likes SET created_at = NOW() - INTERVAL '40 days' WHERE id = ${oldLike.id}`,
    )
    const feed = await viewerFeed()
    expect(feed.items.some((a) => a.id === `like-${oldLike.id}`)).toBe(false)
    await payload.delete({ collection: 'posts', id: oldPost.id })
  })
})

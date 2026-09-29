import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { Badge, User } from '@/payload-types'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
let alice: User
let bob: User
let postBadge: Badge
let manualBadge: Badge

const stamp = Date.now()

// Server actions pass the session user (which carries `collection`) into
// Local API ops — mirror that shape here.
const asUser = (user: User) => ({ ...user, collection: 'users' as const })

const pointsOf = async (userId: number) =>
  (await payload.findByID({ collection: 'users', id: userId, depth: 0 })).points ?? 0

const eventCount = async (key: string) =>
  (
    await payload.find({
      collection: 'point-events',
      where: { key: { equals: key } },
      limit: 0,
      depth: 0,
    })
  ).totalDocs

describe('Gamification', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    for (const [name, assign] of [
      ['alice', (u: User) => (alice = u)],
      ['bob', (u: User) => (bob = u)],
    ] as const) {
      const user = await payload.create({
        collection: 'users',
        data: {
          email: `gam${name}${stamp}@test.dev`,
          password: 'password123',
          name,
          username: `gam${name}${stamp}`.slice(0, 30),
          role: 'user',
        },
      })
      assign(user as User)
    }

    postBadge = await payload.create({
      collection: 'badges',
      data: {
        slug: `gm-first-post-${stamp}`,
        name: 'GM First Post',
        icon: 'medal',
        tier: 'bronze',
        rule: 'posts',
        threshold: 1,
        sort: 0,
      },
    })
    manualBadge = await payload.create({
      collection: 'badges',
      data: {
        slug: `gm-manual-${stamp}`,
        name: 'GM Manual',
        icon: 'trophy',
        tier: 'gold',
        rule: 'manual',
        sort: 0,
      },
    })
  })

  afterAll(async () => {
    if (!payload || !alice) return
    // FK order: notifications and point-events reference everything else.
    await payload.delete({
      collection: 'notifications',
      where: {
        or: [{ recipient: { in: [alice.id, bob.id] } }, { actor: { in: [alice.id, bob.id] } }],
      },
    })
    await payload.delete({
      collection: 'point-events',
      where: { user: { in: [alice.id, bob.id] } },
    })
    await payload.delete({
      collection: 'user-badges',
      where: { user: { in: [alice.id, bob.id] } },
    })
    await payload.delete({
      collection: 'likes',
      where: { user: { in: [alice.id, bob.id] } },
    })
    await payload.delete({
      collection: 'comments',
      where: { author: { in: [alice.id, bob.id] } },
    })
    await payload.delete({
      collection: 'posts',
      where: { author: { in: [alice.id, bob.id] } },
    })
    await payload.delete({
      collection: 'testimonials',
      where: {
        or: [{ author: { in: [alice.id, bob.id] } }, { recipient: { in: [alice.id, bob.id] } }],
      },
    })
    for (const user of [alice, bob]) {
      if (user) await payload.delete({ collection: 'users', id: user.id })
    }
    for (const badge of [postBadge, manualBadge]) {
      if (badge) await payload.delete({ collection: 'badges', id: badge.id })
    }
  })

  it('awards post points to the author', async () => {
    const before = await pointsOf(alice.id)
    const post = await payload.create({
      collection: 'posts',
      data: { author: alice.id, content: `gm post ${stamp}`, category: 'kwento' },
      user: asUser(alice),
      overrideAccess: false,
    })

    expect(await pointsOf(alice.id)).toBe(before + 10)
    expect(await eventCount(`post:${post.id}`)).toBe(1)
  })

  it('auto-grants a threshold badge and notifies the user', async () => {
    // The post above already crossed the posts:1 threshold.
    const award = await payload.find({
      collection: 'user-badges',
      where: { and: [{ user: { equals: alice.id } }, { badge: { equals: postBadge.id } }] },
      limit: 1,
      depth: 0,
    })
    expect(award.totalDocs).toBe(1)

    const notification = await payload.find({
      collection: 'notifications',
      where: {
        and: [
          { recipient: { equals: alice.id } },
          { type: { equals: 'badge' } },
          { badge: { equals: postBadge.id } },
        ],
      },
      limit: 1,
      depth: 0,
    })
    expect(notification.totalDocs).toBe(1)
  })

  it('pays the post author for a like, once per liker', async () => {
    const post = (
      await payload.find({
        collection: 'posts',
        where: { author: { equals: alice.id } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]

    const before = await pointsOf(alice.id)
    const like = await payload.create({
      collection: 'likes',
      data: { user: bob.id, post: post.id },
      user: asUser(bob),
      overrideAccess: false,
    })
    expect(await pointsOf(alice.id)).toBe(before + 2)

    // Unlike → re-like hits the dedupe key: no second award.
    await payload.delete({
      collection: 'likes',
      id: like.id,
      user: asUser(bob),
      overrideAccess: false,
    })
    await payload.create({
      collection: 'likes',
      data: { user: bob.id, post: post.id },
      user: asUser(bob),
      overrideAccess: false,
    })
    expect(await pointsOf(alice.id)).toBe(before + 2)
    expect(await eventCount(`like:${post.id}:${bob.id}`)).toBe(1)
  })

  it('does not pay for self-likes', async () => {
    const post = (
      await payload.find({
        collection: 'posts',
        where: { author: { equals: alice.id } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]

    const before = await pointsOf(alice.id)
    await payload.create({
      collection: 'likes',
      data: { user: alice.id, post: post.id },
      user: asUser(alice),
      overrideAccess: false,
    })
    expect(await pointsOf(alice.id)).toBe(before)
    expect(await eventCount(`like:${post.id}:${alice.id}`)).toBe(0)
  })

  it('pays both sides when a testimonial is approved', async () => {
    const testimonial = await payload.create({
      collection: 'testimonials',
      data: {
        author: bob.id,
        recipient: alice.id,
        content: 'great ka-kita',
        status: 'pending',
      },
      user: asUser(bob),
      overrideAccess: false,
    })

    const aliceBefore = await pointsOf(alice.id)
    const bobBefore = await pointsOf(bob.id)
    await payload.update({
      collection: 'testimonials',
      id: testimonial.id,
      data: { status: 'approved' },
      user: asUser(alice),
      overrideAccess: false,
    })

    expect(await pointsOf(alice.id)).toBe(aliceBefore + 10)
    expect(await pointsOf(bob.id)).toBe(bobBefore + 5)
    expect(await eventCount(`testimonial:${testimonial.id}`)).toBe(1)
  })

  it('notifies on a manual badge grant', async () => {
    await payload.create({
      collection: 'user-badges',
      data: { user: bob.id, badge: manualBadge.id },
    })

    const notification = await payload.find({
      collection: 'notifications',
      where: {
        and: [
          { recipient: { equals: bob.id } },
          { type: { equals: 'badge' } },
          { badge: { equals: manualBadge.id } },
        ],
      },
      limit: 1,
      depth: 0,
    })
    expect(notification.totalDocs).toBe(1)
  })
})

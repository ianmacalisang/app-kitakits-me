import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
let alice: User
let bob: User
let carol: User

// Server actions pass the session user (which carries `collection`) into
// Local API ops — mirror that shape here.
const asUser = (user: User) => ({ ...user, collection: 'users' as const })

const statusOf = async (id: number) => {
  const doc = await payload.findByID({ collection: 'testimonials', id, depth: 0 })
  return doc.status
}

describe('Testimonials', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    for (const [name, assign] of [
      ['alice', (u: User) => (alice = u)],
      ['bob', (u: User) => (bob = u)],
      ['carol', (u: User) => (carol = u)],
    ] as const) {
      const user = await payload.create({
        collection: 'users',
        data: {
          email: `tmnl${name}${stamp}@test.dev`,
          password: 'password123',
          name,
          username: `tmnl${name}${stamp}`.slice(0, 30),
          role: 'user',
        },
      })
      assign(user as User)
    }
  })

  afterAll(async () => {
    if (!payload || !alice) return
    // Notifications FK-reference testimonials, so they must go first.
    await payload.delete({
      collection: 'notifications',
      where: {
        or: [
          { recipient: { in: [alice.id, bob.id, carol.id] } },
          { actor: { in: [alice.id, bob.id, carol.id] } },
        ],
      },
    })
    await payload.delete({
      collection: 'testimonials',
      where: {
        or: [
          { author: { in: [alice.id, bob.id, carol.id] } },
          { recipient: { in: [alice.id, bob.id, carol.id] } },
        ],
      },
    })
    // Follows created while exercising the permission gate FK-reference the
    // users, so they must go first.
    await payload.delete({
      collection: 'follows',
      where: {
        or: [
          { follower: { in: [alice.id, bob.id, carol.id] } },
          { following: { in: [alice.id, bob.id, carol.id] } },
        ],
      },
    })
    for (const user of [alice, bob, carol]) {
      if (user) await payload.delete({ collection: 'users', id: user.id })
    }
  })

  it('creates a pending testimonial and notifies the recipient', async () => {
    const doc = await payload.create({
      collection: 'testimonials',
      data: { author: alice.id, recipient: bob.id, content: 'A genuinely great person.' },
      user: asUser(alice),
      overrideAccess: false,
    })

    expect(doc.status).toBe('pending')

    const notification = await payload.find({
      collection: 'notifications',
      where: {
        and: [
          { recipient: { equals: bob.id } },
          { actor: { equals: alice.id } },
          { type: { equals: 'testimonial' } },
        ],
      },
      depth: 0,
    })
    expect(notification.totalDocs).toBe(1)
  })

  it('blocks writing one for yourself', async () => {
    await expect(
      payload.create({
        collection: 'testimonials',
        data: { author: alice.id, recipient: alice.id, content: 'Me, myself and I.' },
        user: asUser(alice),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('blocks a second testimonial for the same profile', async () => {
    await expect(
      payload.create({
        collection: 'testimonials',
        data: { author: alice.id, recipient: bob.id, content: 'One more for good measure.' },
        user: asUser(alice),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('hides pending testimonials from third parties', async () => {
    const asCarol = await payload.find({
      collection: 'testimonials',
      where: { recipient: { equals: bob.id } },
      user: asUser(carol),
      overrideAccess: false,
    })
    expect(asCarol.totalDocs).toBe(0)

    // …but both parties can still see it.
    const asBob = await payload.find({
      collection: 'testimonials',
      where: { recipient: { equals: bob.id } },
      user: asUser(bob),
      overrideAccess: false,
    })
    expect(asBob.totalDocs).toBe(1)
  })

  it('lets the recipient approve and notifies the author', async () => {
    const doc = await payload.find({
      collection: 'testimonials',
      where: {
        and: [{ author: { equals: alice.id } }, { recipient: { equals: bob.id } }],
      },
      limit: 1,
      depth: 0,
    })

    await payload.update({
      collection: 'testimonials',
      id: doc.docs[0].id,
      data: { status: 'approved' },
      user: asUser(bob),
      overrideAccess: false,
    })
    expect(await statusOf(doc.docs[0].id)).toBe('approved')

    const notification = await payload.find({
      collection: 'notifications',
      where: {
        and: [
          { recipient: { equals: alice.id } },
          { actor: { equals: bob.id } },
          { type: { equals: 'testimonial' } },
        ],
      },
      depth: 0,
    })
    expect(notification.totalDocs).toBe(1)
  })

  it('shows approved testimonials to everyone', async () => {
    const asCarol = await payload.find({
      collection: 'testimonials',
      where: { recipient: { equals: bob.id } },
      user: asUser(carol),
      overrideAccess: false,
    })
    expect(asCarol.totalDocs).toBe(1)
  })

  it('strips status changes attempted by the author', async () => {
    const doc = await payload.create({
      collection: 'testimonials',
      data: { author: alice.id, recipient: carol.id, content: 'Solid.' },
      user: asUser(alice),
      overrideAccess: false,
    })

    await payload.update({
      collection: 'testimonials',
      id: doc.id,
      data: { status: 'approved' },
      user: asUser(alice),
      overrideAccess: false,
    })
    expect(await statusOf(doc.id)).toBe('pending')
  })

  it('re-pends the testimonial when the author edits it', async () => {
    const doc = await payload.find({
      collection: 'testimonials',
      where: {
        and: [{ author: { equals: alice.id } }, { recipient: { equals: bob.id } }],
      },
      limit: 1,
      depth: 0,
    })
    expect(doc.docs[0].status).toBe('approved')

    await payload.update({
      collection: 'testimonials',
      id: doc.docs[0].id,
      data: { content: 'Actually, let me rephrase — still great.' },
      user: asUser(alice),
      overrideAccess: false,
    })
    expect(await statusOf(doc.docs[0].id)).toBe('pending')
  })

  it("honors the recipient's testimonialPermission setting", async () => {
    await payload.update({
      collection: 'users',
      id: carol.id,
      data: { testimonialPermission: 'off' },
    })

    await expect(
      payload.create({
        collection: 'testimonials',
        data: { author: bob.id, recipient: carol.id, content: 'Trying anyway.' },
        user: asUser(bob),
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    await payload.update({
      collection: 'users',
      id: carol.id,
      data: { testimonialPermission: 'followers' },
    })

    // Bob doesn't follow Carol — still blocked.
    await expect(
      payload.create({
        collection: 'testimonials',
        data: { author: bob.id, recipient: carol.id, content: 'Trying anyway.' },
        user: asUser(bob),
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Once Bob follows her, it works.
    await payload.create({
      collection: 'follows',
      data: { follower: bob.id, following: carol.id },
      user: asUser(bob),
      overrideAccess: false,
    })
    const doc = await payload.create({
      collection: 'testimonials',
      data: { author: bob.id, recipient: carol.id, content: 'Came around.' },
      user: asUser(bob),
      overrideAccess: false,
    })
    expect(doc.status).toBe('pending')
  })

  it('deletes notifications that reference a deleted testimonial', async () => {
    const doc = await payload.create({
      collection: 'testimonials',
      data: { author: carol.id, recipient: alice.id, content: 'Ship it.' },
      user: asUser(carol),
      overrideAccess: false,
    })

    await payload.delete({
      collection: 'testimonials',
      id: doc.id,
      user: asUser(carol),
      overrideAccess: false,
    })

    const dangling = await payload.find({
      collection: 'notifications',
      where: { testimonial: { equals: doc.id } },
      depth: 0,
    })
    expect(dangling.totalDocs).toBe(0)
  })
})

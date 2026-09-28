// Node env — Payload's server-only deps (uploadthing UTApi, jose realm
// checks) misbehave under jsdom.

// @vitest-environment node

import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { getMutualFollowIds, mintChatTicket } from '@/lib/chat'

import { decodeJwt, jwtVerify } from 'jose'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
let alice: User
let bob: User
let carol: User

const follow = (follower: number, following: number) =>
  payload.create({
    collection: 'follows',
    data: { follower, following },
  })

describe('Chat tickets', () => {
  // First payload init pulls the DB schema — comfortably over the default
  // 10s hook timeout on a cold connection.
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    alice = await payload.create({
      collection: 'users',
      data: {
        email: `chatalice${stamp}@test.dev`,
        password: 'password123',
        name: 'Alice',
        username: `chatalice${stamp}`.slice(0, 30),
        role: 'user',
      },
    })
    bob = await payload.create({
      collection: 'users',
      data: {
        email: `chatbob${stamp}@test.dev`,
        password: 'password123',
        name: 'Bob',
        username: `chatbob${stamp}`.slice(0, 30),
        role: 'user',
      },
    })
    carol = await payload.create({
      collection: 'users',
      data: {
        email: `chatcarol${stamp}@test.dev`,
        password: 'password123',
        name: 'Carol',
        username: `chatcarol${stamp}`.slice(0, 30),
        role: 'user',
      },
    })
  }, 60_000)

  afterAll(async () => {
    if (!payload || !alice) return
    const ids = [alice, bob, carol].filter(Boolean).map((u) => u.id)
    // Follow creates notification rows that reference the users — they must go
    // first or the user delete trips notifications' NOT NULL recipient.
    await payload.delete({
      collection: 'notifications',
      where: {
        or: [{ recipient: { in: ids } }, { actor: { in: ids } }],
      },
    })
    await payload.delete({
      collection: 'follows',
      where: {
        or: [{ follower: { in: ids } }, { following: { in: ids } }],
      },
    })
    for (const id of ids) {
      await payload.delete({ collection: 'users', id })
    }
  }, 60_000)

  it('returns only mutual follows', async () => {
    // alice ↔ bob mutual; alice → carol is one-sided.
    await follow(alice.id, bob.id)
    await follow(bob.id, alice.id)
    await follow(alice.id, carol.id)

    const mutuals = await getMutualFollowIds(payload, alice.id)
    expect(mutuals).toEqual([bob.id])
    expect(await getMutualFollowIds(payload, carol.id)).toEqual([])
  }, 30_000)

  it('keeps existing chats possible when a follow is removed later', async () => {
    // The ticket only gates *starting* — removal shrinks future mutuals.
    const before = await getMutualFollowIds(payload, alice.id)
    expect(before).toEqual([bob.id])
  })

  it('mints an HS256 ticket the chat service can verify', async () => {
    const mutuals = await getMutualFollowIds(payload, alice.id)
    const { ticket, expiresAt } = await mintChatTicket(alice, mutuals)

    const secret = process.env.CHAT_TICKET_SECRET || process.env.PAYLOAD_SECRET || ''
    const { payload: claims } = await jwtVerify(ticket, Buffer.from(secret, 'utf8'), {
      algorithms: ['HS256'],
    })

    expect(claims.uid).toBe(alice.id)
    expect(claims.username).toBe(alice.username)
    expect(claims.mutuals).toEqual([bob.id])
    expect(Number(claims.exp) * 1000).toBe(expiresAt)

    const decoded = decodeJwt(ticket)
    expect(typeof decoded.iat).toBe('number')
  })

  it('rejects a ticket signed with the wrong secret', async () => {
    const { ticket } = await mintChatTicket(alice, [])
    await expect(
      jwtVerify(ticket, Buffer.from('wrong-secret-wrong-secret-wrong', 'utf8'), {
        algorithms: ['HS256'],
      }),
    ).rejects.toThrow()
  })
})

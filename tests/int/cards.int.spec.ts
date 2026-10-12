// Card room (Unggoy-Ungguyan) collection + serialization + engine tests.
// Node env — Payload's server-only deps misbehave under jsdom. Server actions
// aren't invoked directly (getCurrentUser needs a request context), so this
// spec drives the same Payload operations the actions rely on: create hooks,
// read access gating, the admin-only hands field, the per-player serializer,
// and the pure game engine.

// @vitest-environment node

import { decodeJwt } from 'jose'
import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { getFollowingActivities } from '@/lib/activities'
import { getFollowGraph } from '@/lib/followGraph'
import { awardPoints, evaluateBadges } from '@/lib/gamification'
import { serializeCardRoom } from '@/lib/cards'
import { relId, toNotificationData } from '@/lib/serialize'
import {
  applyDraw,
  buildDeck,
  deal,
  extractPairs,
  isFinished,
  loserId,
  rankOf,
  redistributeForLeave,
  UNGGOY_CARD,
  type UnggoyState,
} from '@/lib/unggoy'
import type { CardRoom, User } from '@/payload-types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let payload: Payload
let alice: User
let bob: User
let carol: User
let room: CardRoom

const mkUser = (tag: string, name: string, stamp: number) =>
  payload.create({
    collection: 'users',
    data: {
      email: `un${tag}${stamp}@test.dev`,
      password: 'password123',
      name,
      username: `un${tag}${stamp}`.slice(0, 30),
      role: 'user',
    },
  })

describe('Unggoy engine', () => {
  it('builds a 49-card deck with QS as the only queen', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(49)
    expect(new Set(deck).size).toBe(49)
    expect(deck.filter((c) => rankOf(c) === 'Q')).toEqual([UNGGOY_CARD])
  })

  it('deals every card into pair-free hands', () => {
    const seats = [11, 22, 33]
    const state = deal(seats)
    const all = seats.flatMap((id) => state.hands[id])
    // Dealt pairs are discarded — remaining cards have unique ranks per hand.
    for (const id of seats) {
      expect(new Set(state.hands[id].map(rankOf)).size).toBe(state.hands[id].length)
    }
    // Whatever left the deck did so in pairs; the unggoy is always dealt in.
    expect((49 - all.length) % 2).toBe(0)
    expect(all.filter((c) => c === UNGGOY_CARD)).toHaveLength(1)
    expect(state.turnSeat).toBe(0)
  })

  it('extracts pairs but keeps the unpairable card', () => {
    const { hand, discarded } = extractPairs(['AS', 'AH', 'QS', '5C', '5D'])
    expect(discarded.sort()).toEqual(['5C', '5D', 'AH', 'AS'].sort())
    expect(hand).toEqual(['QS'])
  })

  it('moves the drawn card, drops the pair it completes, and passes the turn', () => {
    const state: UnggoyState = {
      seats: [1, 2],
      hands: { 1: ['AS', '5D'], 2: ['QS', 'AH'] },
      turnSeat: 1,
    }
    // Seat 1 (user 2) draws index 0 from seat 0 — 'AS' pairs with the 'AH'
    // already in their hand: the pair discards, leaving just the unggoy.
    const res = applyDraw(state, 1, 0)
    expect(res).not.toBeNull()
    expect(res!.drawn).toBe('AS')
    expect(res!.paired).toBe(true)
    expect(res!.state.hands[1]).toEqual(['5D'])
    expect(res!.state.hands[2]).toEqual(['QS'])
    expect(res!.finished).toBe(false)
    expect(res!.state.turnSeat).toBe(0)
  })

  it('rejects out-of-turn and out-of-range draws', () => {
    const state: UnggoyState = { seats: [1, 2], hands: { 1: ['AS'], 2: ['QS'] }, turnSeat: 1 }
    expect(applyDraw(state, 0, 0)).toBeNull() // not seat 0's turn
    expect(applyDraw(state, 1, 5)).toBeNull() // seat 0 has 1 card
    expect(applyDraw(state, 1, -1)).toBeNull()
  })

  it('finishes with the last card holder as the loser', () => {
    // seats [1,2]: 1 holds the unggoy, 2 holds a lone card. Seat 1's turn —
    // it draws 2's card, empties 2's hand, and is stuck with QS.
    const state: UnggoyState = { seats: [1, 2], hands: { 1: ['QS'], 2: ['9H'] }, turnSeat: 0 }
    const res = applyDraw(state, 0, 0)
    expect(res!.finished).toBe(true)
    expect(res!.loserId).toBe(1)
    expect(isFinished(res!.state)).toBe(true)
    expect(loserId(res!.state)).toBe(1)
  })

  it('redistributes a leaver’s cards and keeps the unggoy in play', () => {
    const state: UnggoyState = {
      seats: [1, 2, 3],
      hands: { 1: ['QS', '3D'], 2: ['5C'], 3: ['8S'] },
      turnSeat: 0,
    }
    const next = redistributeForLeave(state, 1)
    expect(next.seats).toEqual([2, 3])
    const all = [...next.hands[2], ...next.hands[3]]
    expect(all).toContain(UNGGOY_CARD)
    // The leaver held the turn — it passes to whoever slid into that seat.
    expect(next.seats[next.turnSeat]).toBe(2)
    // Every hand stays pair-free.
    for (const id of next.seats) {
      expect(new Set(next.hands[id].map(rankOf)).size).toBe(next.hands[id].length)
    }
  })

  it('survives the last seat leaving without NaN turns', () => {
    const next = redistributeForLeave({ seats: [7], hands: { 7: ['QS'] }, turnSeat: 0 }, 7)
    expect(next.seats).toEqual([])
    expect(next.turnSeat).toBe(0)
  })

  it('does not resurrect escaped players when the last holder leaves', () => {
    // Seats 2 and 3 already emptied their hands — they're safe. The leaver's
    // cards must not deal them back into the round.
    const state: UnggoyState = {
      seats: [1, 2, 3],
      hands: { 1: ['QS', '3D'], 2: [], 3: [] },
      turnSeat: 0,
    }
    const next = redistributeForLeave(state, 1)
    expect(next.seats).toEqual([2, 3])
    expect(next.hands[2]).toEqual([])
    expect(next.hands[3]).toEqual([])
    expect(isFinished(next)).toBe(true)
  })
})

describe('Card rooms', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    alice = await mkUser('alice', 'Alice', stamp)
    bob = await mkUser('bob', 'Bob', stamp)
    carol = await mkUser('carol', 'Carol', stamp)
  }, 120_000)

  afterAll(async () => {
    if (!payload || !alice) return
    const ids = [alice, bob, carol].filter(Boolean).map((u) => u.id)
    const rooms = await payload.find({
      collection: 'card-rooms',
      where: {
        or: [
          { host: { in: ids } },
          { members: { contains: ids[0] } },
          { members: { contains: ids[1] } },
          { members: { contains: ids[2] } },
        ],
      },
      limit: 100,
      depth: 0,
    })
    const roomIds = rooms.docs.map((r) => r.id)
    await payload.delete({
      collection: 'notifications',
      where: { or: [{ recipient: { in: ids } }, { actor: { in: ids } }] },
    })
    await payload.delete({
      collection: 'point-events',
      where: { user: { in: ids } },
    })
    await payload.delete({ collection: 'user-badges', where: { user: { in: ids } } })
    await payload.delete({
      collection: 'badges',
      where: { slug: { equals: 'test-unggoy' } },
    })
    if (roomIds.length) {
      await payload.delete({ collection: 'hangout-joins', where: { cardRoom: { in: roomIds } } })
    }
    await payload.delete({ collection: 'card-rooms', where: { host: { in: ids } } })
    for (const id of ids) {
      await payload.delete({ collection: 'users', id })
    }
  }, 60_000)

  it('forces the creator into host + sole member on create', async () => {
    room = await payload.create({
      collection: 'card-rooms',
      data: {
        // Spoofed values — beforeValidate must overwrite them with alice.
        host: bob.id,
        members: [bob.id],
        invites: [{ user: carol.id, invitedBy: bob.id }],
        status: 'ended',
        name: 'Test table',
        game: { variant: 'unggoy' },
      },
      user: alice,
      overrideAccess: false,
    })
    expect(relId(room.host)).toBe(alice.id)
    expect((room.members as number[]).map(relId)).toEqual([alice.id])
    expect(room.invites ?? []).toHaveLength(0)
    expect(room.status).toBe('open')
    expect(room.game?.state).toBe('lobby')
  })

  it('blocks reads for outsiders', async () => {
    const visible = await payload.find({
      collection: 'card-rooms',
      where: { id: { equals: room.id } },
      user: bob,
      overrideAccess: false,
    })
    expect(visible.totalDocs).toBe(0)
    await expect(
      payload.findByID({
        collection: 'card-rooms',
        id: room.id,
        user: bob,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('an invitee can read the room before accepting', async () => {
    room = await payload.update({
      collection: 'card-rooms',
      id: room.id,
      data: {
        invites: [{ user: bob.id, invitedBy: alice.id, invitedAt: new Date().toISOString() }],
      },
      overrideAccess: true,
    })
    const read = await payload.findByID({
      collection: 'card-rooms',
      id: room.id,
      user: bob,
      overrideAccess: false,
    })
    expect(read.id).toBe(room.id)
    await expect(
      payload.findByID({
        collection: 'card-rooms',
        id: room.id,
        user: carol,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('hides the hands field from members reading via access control', async () => {
    // Deal a 2-player round directly on the doc — same shape dealRound writes.
    room = await payload.update({
      collection: 'card-rooms',
      id: room.id,
      data: {
        members: [alice.id, bob.id],
        invites: [],
        game: {
          variant: 'unggoy',
          state: 'playing',
          round: 1,
          seats: [{ user: alice.id }, { user: bob.id }],
          hands: [
            { user: alice.id, cards: ['QS', '3D'] },
            { user: bob.id, cards: ['7H'] },
          ],
          turnSeat: 1,
        },
      },
      overrideAccess: true,
    })

    const asMember = await payload.findByID({
      collection: 'card-rooms',
      id: room.id,
      user: bob,
      overrideAccess: false,
    })
    const rawHands = (asMember.game?.hands ?? []) as { user?: unknown; cards?: unknown }[]
    // Whether the adapter omits the array or strips the json rows, no card
    // codes may reach a member through the plain read path.
    const leaked = rawHands.some((h) => Array.isArray(h.cards) && h.cards.length > 0)
    expect(leaked).toBe(false)

    // System reads (server actions) still get the real hands.
    const asSystem = await payload.findByID({
      collection: 'card-rooms',
      id: room.id,
      depth: 0,
      overrideAccess: true,
    })
    const sysHands = (asSystem.game?.hands ?? []) as { user?: unknown; cards?: unknown }[]
    expect(sysHands.some((h) => (h.cards as string[]).includes('QS'))).toBe(true)
  })

  it('serializes each player’s own cards only — others are counts', async () => {
    const bobsView = await serializeCardRoom(payload, room, bob)
    expect(bobsView.game.state).toBe('playing')
    expect(bobsView.game.mySeat).toBe(1)
    expect(bobsView.game.myCards).toEqual(['7H'])
    const alicePod = bobsView.game.players.find((p) => p.user.id === alice.id)
    expect(alicePod?.cardCount).toBe(2)
    expect(alicePod?.isDrawSource).toBe(true)
    const bobPod = bobsView.game.players.find((p) => p.user.id === bob.id)
    expect(bobPod?.isTurn).toBe(true)

    const alicesView = await serializeCardRoom(payload, room, alice)
    expect(alicesView.game.myCards?.sort()).toEqual(['3D', 'QS'])
    expect(alicesView.game.players.find((p) => p.user.id === bob.id)?.cardCount).toBe(1)

    // A spectator (member, not seated) sees counts only.
    const carolsView = await serializeCardRoom(payload, room, carol)
    expect(carolsView.game.myCards).toBeNull()
    expect(carolsView.game.mySeat).toBeNull()
  })

  it('serializes hangout_invite/request notifications with the card room link', async () => {
    const invite = await payload.create({
      collection: 'notifications',
      data: {
        recipient: bob.id,
        actor: alice.id,
        type: 'hangout_invite',
        cardRoom: room.id,
      },
      overrideAccess: true,
    })
    const inviteData = toNotificationData(
      await payload.findByID({
        collection: 'notifications',
        id: invite.id,
        depth: 2,
        overrideAccess: true,
      }),
    )
    expect(inviteData?.type).toBe('hangout_invite')
    expect(inviteData?.cardRoomId).toBe(room.id)
    expect(inviteData?.cardRoomName).toBe('Test table')

    const request = await payload.create({
      collection: 'notifications',
      data: {
        recipient: alice.id,
        actor: bob.id,
        type: 'hangout_request',
        cardRoom: room.id,
      },
      overrideAccess: true,
    })
    const requestData = toNotificationData(
      await payload.findByID({
        collection: 'notifications',
        id: request.id,
        depth: 2,
        overrideAccess: true,
      }),
    )
    expect(requestData?.type).toBe('hangout_request')
    expect(requestData?.cardRoomId).toBe(room.id)
    expect(requestData?.cardRoomName).toBe('Test table')
  })

  it('surfaces a card-room hangout join in the activities feed', async () => {
    await payload.create({
      collection: 'hangout-joins',
      data: { user: bob.id, cardRoom: room.id, invitedBy: alice.id, kind: 'joined' },
      overrideAccess: true,
    })
    const feed = await getFollowingActivities(
      carol,
      { ...(await getFollowGraph(payload, carol)), authorIds: [bob.id] },
      1,
    )
    const join = feed.items.find((a) => a.type === 'hangout_join')
    expect(join).toBeDefined()
    expect(join?.actorUsername).toBe(bob.username)
    expect(join?.cardRoomId).toBe(room.id)
    expect(join?.cardRoomName).toBe('Test table')
    expect(join?.hangoutKind).toBe('cards')
    expect(join?.hangoutJoinKind).toBe('joined')
  })

  it('mints a room-scoped LiveKit voice token for card tables', async () => {
    process.env.LIVEKIT_API_KEY = 'testkey'
    process.env.LIVEKIT_API_SECRET = 'testsecret-testsecret-testsecret'
    process.env.NEXT_PUBLIC_LIVEKIT_URL = 'wss://voice.test.dev'
    const { mintVoiceToken } = await import('@/lib/livekit')
    const { token, url } = await mintVoiceToken(alice, room.id, true, 'cards')
    expect(url).toBe('wss://voice.test.dev')
    const claims = decodeJwt(token)
    expect((claims as Record<string, unknown>).video).toMatchObject({
      roomJoin: true,
      room: `cards-${room.id}`,
      canPublish: true,
      canSubscribe: true,
    })
  })

  it('dedupes unggoy-win awards per (room, round, user)', async () => {
    const key = `unggoy:${room.id}:1:${bob.id}`
    await awardPoints({ payload }, { userId: bob.id, kind: 'unggoy-win', key })
    await awardPoints({ payload }, { userId: bob.id, kind: 'unggoy-win', key })
    const { totalDocs } = await payload.count({
      collection: 'point-events',
      where: { and: [{ user: { equals: bob.id } }, { kind: { equals: 'unggoy-win' } }] },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(1)
  })

  it('grants an unggoy-wins badge from survivor point events', async () => {
    await payload.create({
      collection: 'badges',
      data: {
        slug: 'test-unggoy',
        name: 'Test Unggoy Dodger',
        icon: 'medal',
        tier: 'bronze',
        rule: 'unggoy-wins',
        threshold: 1,
      },
      overrideAccess: true,
    })
    await evaluateBadges({ payload }, bob.id)
    const { docs } = await payload.find({
      collection: 'user-badges',
      where: { user: { equals: bob.id } },
      depth: 1,
      overrideAccess: true,
    })
    const slugs = docs.map((d) => (typeof d.badge === 'object' && d.badge ? d.badge.slug : null))
    expect(slugs).toContain('test-unggoy')
  })

  it('ended rooms stay readable by members but drop out of the open list', async () => {
    room = await payload.update({
      collection: 'card-rooms',
      id: room.id,
      data: { status: 'ended', invites: [] },
      overrideAccess: true,
    })
    const stillVisible = await payload.find({
      collection: 'card-rooms',
      where: { id: { equals: room.id } },
      user: bob,
      overrideAccess: false,
    })
    expect(stillVisible.totalDocs).toBe(1)
    const open = await payload.find({
      collection: 'card-rooms',
      where: { and: [{ members: { contains: bob.id } }, { status: { equals: 'open' } }] },
      user: bob,
      overrideAccess: false,
    })
    expect(open.totalDocs).toBe(0)
  })
})

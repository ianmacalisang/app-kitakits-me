// Never Have I Ever room collection + serialization + engine tests.
// Node env — Payload's server-only deps misbehave under jsdom. Server actions
// aren't invoked directly (getCurrentUser needs a request context), so this
// spec drives the same Payload operations the actions rely on: create hooks,
// read access gating, the admin-only responses field, the per-player
// serializer, and the pure game engine.

// @vitest-environment node

import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { getFollowingActivities } from '@/lib/activities'
import { getFollowGraph } from '@/lib/followGraph'
import { awardPoints } from '@/lib/gamification'
import { openHangoutOf } from '@/lib/hangouts'
import {
  activeIds,
  advanceTurn,
  allAnswered,
  applyAnswer,
  dealGame,
  isFinished,
  NHIE_PROMPTS,
  nextActiveSeat,
  pickDeckPrompt,
  removePlayer,
  setCustomPrompt,
  skipTurn,
  START_FINGERS,
  winnerId,
  type NhieState,
} from '@/lib/nhie'
import { nhieEngineState, serializeNhieRoom } from '@/lib/nhieRooms'
import { relId, toNotificationData } from '@/lib/serialize'
import type { NhieRoom, User } from '@/payload-types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let payload: Payload
let alice: User
let bob: User
let carol: User
let room: NhieRoom

const mkUser = (tag: string, name: string, stamp: number) =>
  payload.create({
    collection: 'users',
    data: {
      email: `nh${tag}${stamp}@test.dev`,
      password: 'password123',
      name,
      username: `nh${tag}${stamp}`.slice(0, 30),
      role: 'user',
    },
  })

// A mid-answer state for two players: prompt set, no responses yet.
const answering = (over: Partial<NhieState> = {}): NhieState => ({
  seats: [1, 2],
  fingers: { 1: 3, 2: 5 },
  turnSeat: 0,
  prompt: { text: 'kinain ang baon ng kapatid', by: 1, source: 'custom' },
  responses: {},
  usedPrompts: [0],
  ...over,
})

describe('NHIE engine', () => {
  it('deals every seat START_FINGERS with the first seat calling', () => {
    const state = dealGame([11, 22, 33])
    expect(state.seats).toEqual([11, 22, 33])
    for (const id of [11, 22, 33]) expect(state.fingers[id]).toBe(START_FINGERS)
    expect(state.turnSeat).toBe(0)
    expect(state.prompt).toBeNull()
    expect(state.responses).toEqual({})
    expect(isFinished(state)).toBe(false)
  })

  it('draws deck prompts without repeating used indexes', () => {
    const state = dealGame([1, 2])
    const rng = () => 0 // always picks the first unused index
    const first = pickDeckPrompt(state, 1, rng)
    expect(first.prompt.text).toBe(NHIE_PROMPTS[0])
    expect(first.prompt.source).toBe('deck')
    expect(first.prompt.by).toBe(1)
    expect(first.state.usedPrompts).toEqual([0])
    const second = pickDeckPrompt({ ...first.state, prompt: null }, 2, rng)
    expect(second.prompt.text).toBe(NHIE_PROMPTS[1])
    expect(second.state.usedPrompts).toEqual([0, 1])
  })

  it('recycles the deck once every prompt is used', () => {
    const state: NhieState = {
      ...dealGame([1, 2]),
      usedPrompts: NHIE_PROMPTS.map((_, i) => i),
    }
    const drawn = pickDeckPrompt(state, 1, () => 0)
    expect(drawn.prompt.text).toBe(NHIE_PROMPTS[0])
  })

  it('accepts a custom prompt from the turn owner', () => {
    const next = setCustomPrompt(dealGame([1, 2]), 'nag-effort sa crush', 1)
    expect(next.prompt).toEqual({ text: 'nag-effort sa crush', by: 1, source: 'custom' })
  })

  it('drops a finger per "have" answer when the circle resolves', () => {
    let res = applyAnswer(answering(), 1, 'have')
    expect(res).not.toBeNull()
    expect(res!.resolved).toBe(false)
    res = applyAnswer(res!.state, 2, 'never')
    expect(res!.resolved).toBe(true)
    expect(res!.dropped).toEqual([1])
    expect(res!.state.fingers[1]).toBe(2)
    expect(res!.state.fingers[2]).toBe(5)
    expect(res!.finished).toBe(false)
  })

  it('resolves with no drops when everyone answers "never"', () => {
    let res = applyAnswer(answering(), 1, 'never')
    res = applyAnswer(res!.state, 2, 'never')
    expect(res!.resolved).toBe(true)
    expect(res!.dropped).toEqual([])
    expect(res!.state.fingers).toEqual({ 1: 3, 2: 5 })
  })

  it('rejects answers with no prompt, from out players, and duplicates', () => {
    expect(applyAnswer(dealGame([1, 2]), 1, 'have')).toBeNull() // no prompt
    const busted = answering({ fingers: { 1: 0, 2: 5 } })
    expect(applyAnswer(busted, 1, 'have')).toBeNull() // out
    const mid = applyAnswer(answering(), 1, 'have')!.state
    expect(applyAnswer(mid, 1, 'never')).toBeNull() // already locked
  })

  it('finishes when a lone player still has fingers', () => {
    const state = answering({ seats: [1, 2, 3], fingers: { 1: 1, 2: 1, 3: 2 } })
    let res = applyAnswer(state, 1, 'have')!
    res = applyAnswer(res.state, 2, 'have')!
    res = applyAnswer(res.state, 3, 'never')!
    expect(res.resolved).toBe(true)
    expect(res.finished).toBe(true)
    expect(res.winnerId).toBe(3)
    expect(res.state.fingers[3]).toBe(2)
  })

  it('declares no winner when everyone busts on the same prompt', () => {
    const state = answering({ fingers: { 1: 1, 2: 1 } })
    let res = applyAnswer(state, 1, 'have')!
    res = applyAnswer(res.state, 2, 'have')!
    expect(res.finished).toBe(true)
    expect(res.winnerId).toBeNull()
  })

  it('advances the turn to the next player still in', () => {
    const resolved = answering({
      seats: [1, 2, 3],
      fingers: { 1: 0, 2: 3, 3: 4 },
      responses: { 1: 'never', 2: 'have', 3: 'never' },
    })
    const next = advanceTurn(resolved)
    expect(next).not.toBeNull()
    expect(next!.prompt).toBeNull()
    expect(next!.responses).toEqual({})
    expect(next!.turnSeat).toBe(1) // seat 0 (user 1) is out — next is seat 1
  })

  it('refuses to advance mid-answer', () => {
    const mid = applyAnswer(answering({ seats: [1, 2, 3] }), 1, 'have')!.state
    expect(advanceTurn(mid)).toBeNull()
  })

  it('skips an idle turn but not a live circle', () => {
    const prompting = dealGame([1, 2, 3])
    const skipped = skipTurn(prompting)
    expect(skipped!.turnSeat).toBe(1)
    expect(skipTurn(skipped!)!.turnSeat).toBe(2)
    expect(skipTurn(skipTurn(skipped!)!)!.turnSeat).toBe(0) // wraps

    const live = applyAnswer(answering(), 1, 'have')!.state
    expect(skipTurn(live)).toBeNull() // answers pending — can't skip
  })

  it('removes a leaver’s seat and resolves the circle they held up', () => {
    const state = answering({
      seats: [1, 2, 3],
      fingers: { 1: 5, 2: 5, 3: 5 },
      responses: { 1: 'have', 2: 'never' },
    })
    const { state: next, resolved, dropped } = removePlayer(state, 3)
    expect(next.seats).toEqual([1, 2])
    expect(next.fingers[3]).toBeUndefined()
    expect(resolved).toBe(true)
    expect(dropped).toEqual([1])
    expect(next.fingers[1]).toBe(4)
  })

  it('remaps the turn when the leaver was the prompt caller', () => {
    const { state: next } = removePlayer(dealGame([1, 2, 3]), 1)
    expect(next.seats).toEqual([2, 3])
    // Turn seat lands on whoever slid into slot 0 and still holds fingers.
    expect(next.seats[next.turnSeat]).toBe(2)
  })

  it('keeps isFinished/winnerId consistent with the active count', () => {
    const state: NhieState = {
      ...dealGame([1, 2, 3]),
      fingers: { 1: 0, 2: 0, 3: 2 },
    }
    expect(isFinished(state)).toBe(true)
    expect(winnerId(state)).toBe(3)
    expect(activeIds(state)).toEqual([3])
  })

  it('reports allAnswered only across players still in', () => {
    const state = answering({
      seats: [1, 2, 3],
      fingers: { 1: 0, 2: 4, 3: 4 },
      responses: { 2: 'have', 3: 'never' },
    })
    // Seat 1 is out — the circle is complete without them.
    expect(allAnswered(state)).toBe(true)
    expect(nextActiveSeat(state, 0)).toBe(1)
  })
})

describe('NHIE rooms', () => {
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
      collection: 'nhie-rooms',
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
    if (roomIds.length) {
      await payload.delete({ collection: 'hangout-joins', where: { nhieRoom: { in: roomIds } } })
    }
    await payload.delete({ collection: 'nhie-rooms', where: { host: { in: ids } } })
    await payload.delete({ collection: 'videoke-rooms', where: { host: { in: ids } } })
    for (const id of ids) {
      await payload.delete({ collection: 'users', id })
    }
  }, 60_000)

  it('forces the creator into host + sole member on create', async () => {
    room = await payload.create({
      collection: 'nhie-rooms',
      data: {
        // Spoofed values — beforeValidate must overwrite them with alice.
        host: bob.id,
        members: [bob.id],
        invites: [{ user: carol.id, invitedBy: bob.id }],
        status: 'ended',
        name: 'Test circle',
        game: { state: 'lobby' },
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
      collection: 'nhie-rooms',
      where: { id: { equals: room.id } },
      user: bob,
      overrideAccess: false,
    })
    expect(visible.totalDocs).toBe(0)
    await expect(
      payload.findByID({
        collection: 'nhie-rooms',
        id: room.id,
        user: bob,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('an invitee can read the room before accepting', async () => {
    room = await payload.update({
      collection: 'nhie-rooms',
      id: room.id,
      data: {
        invites: [{ user: bob.id, invitedBy: alice.id, invitedAt: new Date().toISOString() }],
      },
      overrideAccess: true,
    })
    const read = await payload.findByID({
      collection: 'nhie-rooms',
      id: room.id,
      user: bob,
      overrideAccess: false,
    })
    expect(read.id).toBe(room.id)
    await expect(
      payload.findByID({
        collection: 'nhie-rooms',
        id: room.id,
        user: carol,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('hides the responses field from members reading via access control', async () => {
    // Deal a 2-player game directly on the doc — same shape dealNewGame writes.
    room = await payload.update({
      collection: 'nhie-rooms',
      id: room.id,
      data: {
        members: [alice.id, bob.id],
        invites: [],
        game: {
          state: 'playing',
          round: 1,
          seats: [{ user: alice.id }, { user: bob.id }],
          fingers: [
            { user: alice.id, count: 4 },
            { user: bob.id, count: 5 },
          ],
          turnSeat: 0,
          prompt: { text: 'natulog sa klase', by: alice.id, source: 'deck' },
          responses: [{ user: alice.id, answer: 'have' }],
          usedPrompts: [3],
        },
      },
      overrideAccess: true,
    })

    const asMember = await payload.findByID({
      collection: 'nhie-rooms',
      id: room.id,
      user: bob,
      overrideAccess: false,
    })
    const rawResponses = (asMember.game?.responses ?? []) as { answer?: unknown }[]
    // Whether the adapter omits the array or strips the rows, no answer
    // values may reach a member through the plain read path.
    const leaked = rawResponses.some((r) => r.answer === 'have' || r.answer === 'never')
    expect(leaked).toBe(false)

    // System reads (server actions) still get the real responses.
    const asSystem = await payload.findByID({
      collection: 'nhie-rooms',
      id: room.id,
      depth: 0,
      overrideAccess: true,
    })
    const sysResponses = (asSystem.game?.responses ?? []) as { answer?: string }[]
    expect(sysResponses.some((r) => r.answer === 'have')).toBe(true)
  })

  it('serializes answers only once the circle resolves', async () => {
    // Mid-answer — alice locked "have", bob hasn't answered yet.
    const midView = await serializeNhieRoom(payload, room, bob)
    expect(midView.game.state).toBe('playing')
    expect(midView.game.phase).toBe('answering')
    expect(midView.game.answers).toBeNull()
    expect(midView.game.myAnswer).toBeNull()
    const alicePod = midView.game.players.find((p) => p.user.id === alice.id)
    expect(alicePod?.hasAnswered).toBe(true)
    expect(alicePod?.fingers).toBe(4)

    // Alice sees her own answer immediately.
    const alicesView = await serializeNhieRoom(payload, room, alice)
    expect(alicesView.game.myAnswer).toBe('have')
    expect(alicesView.game.answers).toBeNull()

    // Bob answers, circle resolves — engine state now carries both answers.
    room = await payload.update({
      collection: 'nhie-rooms',
      id: room.id,
      data: {
        game: {
          ...room.game,
          fingers: [
            { user: alice.id, count: 3 },
            { user: bob.id, count: 5 },
          ],
          responses: [
            { user: alice.id, answer: 'have' },
            { user: bob.id, answer: 'never' },
          ],
          lastResult: { text: 'natulog sa klase', drops: [alice.id] },
        },
      },
      overrideAccess: true,
    })
    const revealed = await serializeNhieRoom(payload, room, bob)
    expect(revealed.game.phase).toBe('revealed')
    expect(revealed.game.myAnswer).toBe('never')
    const aliceReveal = revealed.game.answers?.find((a) => a.user.id === alice.id)
    expect(aliceReveal?.answer).toBe('have')
    expect(revealed.game.lastResult?.drops[0]?.id).toBe(alice.id)
  })

  it('serializes hangout_invite/request notifications with the nhie room link', async () => {
    const invite = await payload.create({
      collection: 'notifications',
      data: {
        recipient: bob.id,
        actor: alice.id,
        type: 'hangout_invite',
        nhieRoom: room.id,
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
    expect(inviteData?.nhieRoomId).toBe(room.id)
    expect(inviteData?.nhieRoomName).toBe('Test circle')

    const request = await payload.create({
      collection: 'notifications',
      data: {
        recipient: alice.id,
        actor: bob.id,
        type: 'hangout_request',
        nhieRoom: room.id,
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
    expect(requestData?.nhieRoomId).toBe(room.id)
    expect(requestData?.nhieRoomName).toBe('Test circle')
  })

  it('surfaces an nhie-room hangout join in the activities feed', async () => {
    await payload.create({
      collection: 'hangout-joins',
      data: { user: bob.id, nhieRoom: room.id, invitedBy: alice.id, kind: 'joined' },
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
    expect(join?.nhieRoomId).toBe(room.id)
    expect(join?.nhieRoomName).toBe('Test circle')
    expect(join?.hangoutKind).toBe('nhie')
    expect(join?.hangoutJoinKind).toBe('joined')
  })

  it('dedupes nhie-win awards per (room, round, user)', async () => {
    const key = `nhie:${room.id}:1:${bob.id}`
    await awardPoints({ payload }, { userId: bob.id, kind: 'nhie-win', key })
    await awardPoints({ payload }, { userId: bob.id, kind: 'nhie-win', key })
    const { totalDocs } = await payload.count({
      collection: 'point-events',
      where: { and: [{ user: { equals: bob.id } }, { kind: { equals: 'nhie-win' } }] },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(1)
  })

  it('nhieEngineState reads the doc back into engine shape', async () => {
    const state = nhieEngineState(room)
    expect(state.seats.sort()).toEqual([alice.id, bob.id].sort())
    expect(state.fingers[alice.id]).toBe(3)
    expect(state.responses[bob.id]).toBe('never')
    expect(state.prompt?.text).toBe('natulog sa klase')
    expect(state.usedPrompts).toEqual([3])
  })

  it('openHangoutOf counts open rooms across every hangout app', async () => {
    // carol is free; bob is a member of the (open) nhie room alongside alice.
    expect(await openHangoutOf(payload, carol.id)).toBeNull()
    const busy = await openHangoutOf(payload, bob.id)
    expect(busy).toMatchObject({ kind: 'nhie', id: room.id, name: 'Test circle' })
    expect(busy?.memberCount).toBe(2)

    // Solo rooms are exempt — a host alone in an empty room isn't "at" a
    // hangout, so carol's fresh videoke room doesn't gate her.
    const vroom = await payload.create({
      collection: 'videoke-rooms',
      data: { host: carol.id, name: 'Carol ke', members: [carol.id], status: 'open' },
      user: carol,
      overrideAccess: false,
    })
    expect(await openHangoutOf(payload, carol.id)).toBeNull()

    // The moment a second member lands it counts again.
    await payload.update({
      collection: 'videoke-rooms',
      id: vroom.id,
      data: { members: [carol.id, alice.id] },
      overrideAccess: true,
    })
    const vbusy = await openHangoutOf(payload, carol.id)
    expect(vbusy).toMatchObject({ kind: 'videoke', id: vroom.id, hostId: carol.id })

    // Ended rooms don't hold anyone.
    await payload.update({
      collection: 'videoke-rooms',
      id: vroom.id,
      data: { status: 'ended' },
      overrideAccess: true,
    })
    expect(await openHangoutOf(payload, carol.id)).toBeNull()
  })

  it('ended rooms stay readable by members but drop out of the open list', async () => {
    room = await payload.update({
      collection: 'nhie-rooms',
      id: room.id,
      data: { status: 'ended', invites: [] },
      overrideAccess: true,
    })
    const stillVisible = await payload.find({
      collection: 'nhie-rooms',
      where: { id: { equals: room.id } },
      user: bob,
      overrideAccess: false,
    })
    expect(stillVisible.totalDocs).toBe(1)
    const open = await payload.find({
      collection: 'nhie-rooms',
      where: { and: [{ members: { contains: bob.id } }, { status: { equals: 'open' } }] },
      user: bob,
      overrideAccess: false,
    })
    expect(open.totalDocs).toBe(0)
  })
})

// Videoke room collection + serialization tests. Node env — Payload's
// server-only deps misbehave under jsdom. Server actions aren't invoked
// directly (getCurrentUser needs a request context), so this spec drives the
// same Payload operations the actions rely on: create hooks, read access
// gating, invite rows, queue ordering, and the room serializer.

// @vitest-environment node

import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { getFollowingActivities } from '@/lib/activities'
import { relId, toNotificationData } from '@/lib/serialize'
import { serializeVideokeRoom } from '@/lib/videoke'
import type { User, VideokeRoom } from '@/payload-types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let payload: Payload
let alice: User
let bob: User
let carol: User
let room: VideokeRoom

const mkUser = (tag: string, name: string, stamp: number) =>
  payload.create({
    collection: 'users',
    data: {
      email: `vk${tag}${stamp}@test.dev`,
      password: 'password123',
      name,
      username: `vk${tag}${stamp}`.slice(0, 30),
      role: 'user',
    },
  })

describe('Videoke rooms', () => {
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
    // Queue items reference rooms — drop them first so room deletes don't
    // trip the required relationship.
    const rooms = await payload.find({
      collection: 'videoke-rooms',
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
    if (roomIds.length) {
      await payload.delete({
        collection: 'videoke-queue-items',
        where: { room: { in: roomIds } },
      })
    }
    await payload.delete({
      collection: 'notifications',
      where: { or: [{ recipient: { in: ids } }, { actor: { in: ids } }] },
    })
    if (roomIds.length) {
      await payload.delete({ collection: 'hangout-joins', where: { room: { in: roomIds } } })
    }
    await payload.delete({ collection: 'videoke-rooms', where: { host: { in: ids } } })
    for (const id of ids) {
      await payload.delete({ collection: 'users', id })
    }
  }, 60_000)

  it('forces the creator into host + sole member on create', async () => {
    room = await payload.create({
      collection: 'videoke-rooms',
      data: {
        // Spoofed values — beforeValidate must overwrite them with alice.
        host: bob.id,
        members: [bob.id],
        invites: [{ user: carol.id, invitedBy: bob.id }],
        status: 'ended',
        name: 'Test room',
      },
      user: alice,
      overrideAccess: false,
    })
    expect(relId(room.host)).toBe(alice.id)
    expect((room.members as number[]).map(relId)).toEqual([alice.id])
    expect(room.invites ?? []).toHaveLength(0)
    expect(room.status).toBe('open')
  })

  it('blocks reads for outsiders', async () => {
    const visible = await payload.find({
      collection: 'videoke-rooms',
      where: { id: { equals: room.id } },
      user: bob,
      overrideAccess: false,
    })
    expect(visible.totalDocs).toBe(0)
    await expect(
      payload.findByID({
        collection: 'videoke-rooms',
        id: room.id,
        user: bob,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('an invitee can read the room before accepting', async () => {
    room = await payload.update({
      collection: 'videoke-rooms',
      id: room.id,
      data: {
        invites: [{ user: bob.id, invitedBy: alice.id, invitedAt: new Date().toISOString() }],
      },
      overrideAccess: true,
    })
    const read = await payload.findByID({
      collection: 'videoke-rooms',
      id: room.id,
      user: bob,
      overrideAccess: false,
    })
    expect(read.id).toBe(room.id)
    // Carol — neither member nor invitee — stays locked out.
    await expect(
      payload.findByID({
        collection: 'videoke-rooms',
        id: room.id,
        user: carol,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('accepting moves the invitee into members', async () => {
    room = await payload.update({
      collection: 'videoke-rooms',
      id: room.id,
      data: { members: [alice.id, bob.id], invites: [] },
      overrideAccess: true,
    })
    const asMember = await payload.findByID({
      collection: 'videoke-rooms',
      id: room.id,
      user: bob,
      overrideAccess: false,
    })
    expect((asMember.members as number[]).map(relId)).toContain(bob.id)
  })

  it('serializes the room with populated heads, playback, and ordered queue', async () => {
    const add = (
      title: string,
      position: number,
      state: 'queued' | 'playing' | 'done' | 'skipped' = 'queued',
    ) =>
      payload.create({
        collection: 'videoke-queue-items',
        data: {
          room: room.id,
          videoId: 'abcdefghijk',
          title,
          addedBy: alice.id,
          state,
          position,
        },
        overrideAccess: true,
      })

    // Inserted out of order — the serialized queue must sort by position.
    const third = await add('Third', 3)
    const playing = await add('Now singing', 0, 'playing')
    const second = await add('Second', 2)

    room = await payload.update({
      collection: 'videoke-rooms',
      id: room.id,
      data: {
        playback: {
          item: playing.id,
          state: 'playing',
          startedAt: new Date().toISOString(),
          positionSec: 12,
        },
      },
      overrideAccess: true,
    })

    const { docs: items } = await payload.find({
      collection: 'videoke-queue-items',
      where: { room: { equals: room.id }, state: { not_equals: 'done' } },
      sort: ['position', 'createdAt'],
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    const data = await serializeVideokeRoom(payload, room, items)
    expect(data.id).toBe(room.id)
    expect(data.status).toBe('open')
    expect(data.host?.id).toBe(alice.id)
    expect(data.members.map((m) => m.id)).toEqual([alice.id, bob.id])
    expect(data.queue.map((q) => q.title)).toEqual(['Now singing', 'Second', 'Third'])
    expect(data.playback.itemId).toBe(playing.id)
    expect(data.playback.state).toBe('playing')
    expect(data.playback.positionSec).toBe(12)
    expect(data.serverNow).toBeGreaterThan(0)
    expect(third.id + second.id).toBeGreaterThan(0)
  })

  it('keeps raw queue docs admin-scoped — users go through room actions', async () => {
    await expect(
      payload.find({
        collection: 'videoke-queue-items',
        where: { room: { equals: room.id } },
        user: bob,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const system = await payload.find({
      collection: 'videoke-queue-items',
      where: { room: { equals: room.id } },
      overrideAccess: true,
    })
    expect(system.totalDocs).toBe(3)
  })

  it('serializes a hangout_invite notification with the room link', async () => {
    const created = await payload.create({
      collection: 'notifications',
      data: {
        recipient: bob.id,
        actor: alice.id,
        type: 'hangout_invite',
        videokeRoom: room.id,
      },
      overrideAccess: true,
    })
    const full = await payload.findByID({
      collection: 'notifications',
      id: created.id,
      depth: 2,
      overrideAccess: true,
    })
    const data = toNotificationData(full)
    expect(data?.type).toBe('hangout_invite')
    expect(data?.actorUsername).toBe(alice.username)
    expect(data?.videokeRoomId).toBe(room.id)
    expect(data?.videokeRoomName).toBe('Test room')
  })

  it('surfaces a hangout join in the activities feed', async () => {
    await payload.create({
      collection: 'hangout-joins',
      data: { user: bob.id, room: room.id, invitedBy: alice.id, kind: 'joined' },
      overrideAccess: true,
    })
    // Carol follows Bob but is not a party to the room — access-checked
    // population can't load join.room for her, so the feed hydrates the
    // room/head docs itself. Her feed must still show the join.
    const feed = await getFollowingActivities(carol, [bob.id], 1)
    const join = feed.items.find((a) => a.type === 'hangout_join')
    expect(join).toBeDefined()
    expect(join?.actorUsername).toBe(bob.username)
    expect(join?.targetUsername).toBe(alice.username)
    expect(join?.videokeRoomId).toBe(room.id)
    expect(join?.videokeRoomName).toBe('Test room')
    expect(join?.hangoutJoinKind).toBe('joined')
  })

  it('ended rooms stay readable by members but drop out of the open list', async () => {
    room = await payload.update({
      collection: 'videoke-rooms',
      id: room.id,
      data: {
        status: 'ended',
        playback: { item: null, state: 'idle', startedAt: null, positionSec: 0 },
      },
      overrideAccess: true,
    })
    const stillVisible = await payload.find({
      collection: 'videoke-rooms',
      where: { id: { equals: room.id } },
      user: bob,
      overrideAccess: false,
    })
    expect(stillVisible.totalDocs).toBe(1)
    const open = await payload.find({
      collection: 'videoke-rooms',
      where: { and: [{ members: { contains: bob.id } }, { status: { equals: 'open' } }] },
      user: bob,
      overrideAccess: false,
    })
    expect(open.totalDocs).toBe(0)
  })
})

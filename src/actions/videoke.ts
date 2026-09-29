'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getMutualFollowIds } from '@/lib/chat'
import { pushLive } from '@/lib/live'
import { getPayloadClient } from '@/lib/payload'
import { checkRate } from '@/lib/rate-limit'
import { relId } from '@/lib/serialize'
import {
  roomMemberIds,
  serializeVideokeRoom,
  serializeVideokeSummary,
  type VideokeRoomData,
  type VideokeRoomSummary,
} from '@/lib/videoke'
import { getChannelVideo, searchChannelVideos, youtubeConfigured } from '@/lib/youtube'
import type { User, VideokeQueueItem, VideokeRoom } from '@/payload-types'

const ROOM_MEMBER_CAP = 30
const QUEUE_CAP = 100
const INVITE_CAP = 20 // per call

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>
type ActionResult = { ok: true; room?: VideokeRoomData } | { ok: false; error: string }

const fail = (error: string): ActionResult => ({ ok: false, error })

// Rewrite persisted invite rows for an update payload — drops any row whose
// user reference can't be resolved.
const inviteRows = (room: VideokeRoom) =>
  (room.invites ?? []).flatMap((i) => {
    const uid = relId(i.user)
    if (uid === null) return []
    return [
      {
        user: uid,
        invitedBy: relId(i.invitedBy) ?? undefined,
        invitedAt: i.invitedAt ?? undefined,
      },
    ]
  })

const memberIdsOf = (room: VideokeRoom) => roomMemberIds(room)
const inviteeIdsOf = (room: VideokeRoom) =>
  (room.invites ?? []).map((i) => relId(i.user)).filter((id): id is number => id !== null)

// Load a room the current user can see (member or invitee) — Payload access
// throws on a miss, matching the Threads endpoints' findByID pattern.
const loadVisibleRoom = async (
  payload: PayloadClient,
  roomId: number,
  user: User,
): Promise<VideokeRoom | null> => {
  try {
    return await payload.findByID({
      collection: 'videoke-rooms',
      id: roomId,
      depth: 0,
      user,
      overrideAccess: false,
    })
  } catch {
    return null
  }
}

const roomQueue = async (payload: PayloadClient, roomId: number) => {
  const { docs } = await payload.find({
    collection: 'videoke-queue-items',
    where: { room: { equals: roomId }, state: { not_equals: 'done' } },
    sort: ['position', 'createdAt'],
    limit: QUEUE_CAP + 20,
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

const serialize = (payload: PayloadClient, room: VideokeRoom) =>
  roomQueue(payload, room.id).then((items) => serializeVideokeRoom(payload, room, items))

const pokeRoom = (room: VideokeRoom, extraTargets: number[] = []) => {
  pushLive([...new Set([...memberIdsOf(room), ...inviteeIdsOf(room), ...extraTargets])], {
    type: 'videoke:update',
    roomId: room.id,
  })
}

const requireUser = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

// ── Lobby ──────────────────────────────────────────────────────────────────

export async function getVideokeLobby(): Promise<{
  rooms: VideokeRoomSummary[]
  invites: VideokeRoomSummary[]
}> {
  const user = await requireUser()
  const payload = await getPayloadClient()

  const [rooms, invited] = await Promise.all([
    payload.find({
      collection: 'videoke-rooms',
      where: { and: [{ members: { contains: user.id } }, { status: { equals: 'open' } }] },
      sort: '-updatedAt',
      limit: 50,
      depth: 0,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'videoke-rooms',
      where: { and: [{ 'invites.user': { equals: user.id } }, { status: { equals: 'open' } }] },
      sort: '-updatedAt',
      limit: 50,
      depth: 0,
      user,
      overrideAccess: false,
    }),
  ])

  const all = [...rooms.docs, ...invited.docs]
  const ids = all.map((r) => r.id)
  const playing =
    ids.length === 0
      ? []
      : (
          await payload.find({
            collection: 'videoke-queue-items',
            where: { and: [{ room: { in: ids } }, { state: { equals: 'playing' } }] },
            limit: 50,
            depth: 0,
            overrideAccess: true,
          })
        ).docs
  const playingByRoom = new Map(playing.map((i) => [relId(i.room), i]))

  return {
    rooms: await Promise.all(
      rooms.docs.map((r) => serializeVideokeSummary(payload, r, playingByRoom.get(r.id) ?? null)),
    ),
    invites: await Promise.all(
      invited.docs.map((r) =>
        serializeVideokeSummary(payload, r, playingByRoom.get(r.id) ?? null, user.id),
      ),
    ),
  }
}

export async function createVideokeRoom(name: string): Promise<ActionResult & { roomId?: number }> {
  const user = await requireUser()
  if (!checkRate(`vroom-create:${user.id}`, 5, 60 * 60_000)) {
    return fail('Too many rooms — try again later.')
  }
  const payload = await getPayloadClient()
  const room = await payload.create({
    collection: 'videoke-rooms',
    data: {
      host: user.id,
      name: name.trim().slice(0, 80) || undefined,
      members: [user.id],
      invites: [],
      status: 'open',
    },
    user,
    overrideAccess: false,
  })
  return { ok: true, roomId: room.id }
}

// ── Room state ─────────────────────────────────────────────────────────────

export async function getVideokeRoom(roomId: number): Promise<VideokeRoomData | null> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return null
  return serialize(payload, room)
}

// ── Invites ────────────────────────────────────────────────────────────────

export async function inviteToVideoke(roomId: number, targetIds: number[]): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return fail('Room not found.')
  if (room.status !== 'open') return fail('This room has ended.')
  if (!memberIdsOf(room).includes(user.id)) return fail('Only room members can invite.')

  const wanted = [...new Set(targetIds.filter((id) => Number.isInteger(id) && id > 0))].slice(
    0,
    INVITE_CAP,
  )
  const taken = new Set([...memberIdsOf(room), ...inviteeIdsOf(room)])
  const mutuals = new Set(await getMutualFollowIds(payload, user.id))
  const targets = wanted.filter((id) => mutuals.has(id) && !taken.has(id))
  if (targets.length === 0) return fail('Nobody new to invite.')

  if (memberIdsOf(room).length + targets.length > ROOM_MEMBER_CAP) {
    return fail('This room is full.')
  }

  const next = await payload.update({
    collection: 'videoke-rooms',
    id: room.id,
    data: {
      invites: [
        ...inviteRows(room),
        ...targets.map((id) => ({
          user: id,
          invitedBy: user.id,
          invitedAt: new Date().toISOString(),
        })),
      ],
    },
    overrideAccess: true,
  })

  pushLive(targets, { type: 'videoke:invite', roomId: room.id, from: user.name })
  pushLive(memberIdsOf(next), { type: 'videoke:update', roomId: room.id })
  return { ok: true, room: await serialize(payload, next) }
}

export async function respondVideokeInvite(roomId: number, accept: boolean): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return fail('Room not found.')
  if (room.status !== 'open') return fail('This room has ended.')
  const myInvite = (room.invites ?? []).find((i) => relId(i.user) === user.id)
  if (!myInvite) return fail('No pending invite for this room.')

  const remainingInvites = inviteRows(room).filter((i) => i.user !== user.id)

  if (!accept) {
    const next = await payload.update({
      collection: 'videoke-rooms',
      id: room.id,
      data: { invites: remainingInvites },
      overrideAccess: true,
    })
    pushLive(memberIdsOf(next), { type: 'videoke:update', roomId: room.id })
    return { ok: true }
  }

  if (memberIdsOf(room).length >= ROOM_MEMBER_CAP) return fail('This room is full.')

  const next = await payload.update({
    collection: 'videoke-rooms',
    id: room.id,
    data: { invites: remainingInvites, members: [...memberIdsOf(room), user.id] },
    overrideAccess: true,
  })
  pokeRoom(next)
  return { ok: true, room: await serialize(payload, next) }
}

// ── Membership lifecycle ───────────────────────────────────────────────────

export async function leaveVideokeRoom(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room || !memberIdsOf(room).includes(user.id)) return fail('You are not in this room.')

  // Host leaving ends the room for everyone — no host transfer in v1.
  if (relId(room.host) === user.id) return endVideokeRoom(roomId)

  const next = await payload.update({
    collection: 'videoke-rooms',
    id: room.id,
    data: { members: memberIdsOf(room).filter((id) => id !== user.id) },
    overrideAccess: true,
  })
  pushLive([...memberIdsOf(next), user.id], { type: 'videoke:update', roomId: room.id })
  return { ok: true }
}

export async function endVideokeRoom(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return fail('Room not found.')
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can end the room.')
  }
  if (room.status === 'ended') return { ok: true }

  const next = await payload.update({
    collection: 'videoke-rooms',
    id: room.id,
    data: {
      status: 'ended',
      playback: { item: null, state: 'idle', startedAt: null, positionSec: 0 },
    },
    overrideAccess: true,
  })
  pokeRoom(next)
  return { ok: true }
}

// ── YouTube search + queue ─────────────────────────────────────────────────

export async function searchVideokeSongs(query: string) {
  const user = await requireUser()
  if (!youtubeConfigured()) return { ok: false as const, error: 'unavailable', items: [] }
  if (!checkRate(`ytsearch:${user.id}`, 20, 60_000)) {
    return { ok: false as const, error: 'Searching too fast — wait a moment.', items: [] }
  }
  return { ok: true as const, error: null, items: await searchChannelVideos(query) }
}

const loadOpenMemberRoom = async (
  payload: PayloadClient,
  roomId: number,
  user: User,
): Promise<VideokeRoom | string> => {
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return 'Room not found.'
  if (room.status !== 'open') return 'This room has ended.'
  if (!memberIdsOf(room).includes(user.id)) return 'You are not in this room.'
  return room
}

export async function queueVideokeSong(roomId: number, videoId: string): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  if (!checkRate(`vqueue:${user.id}`, 30, 60_000)) return fail('Adding songs too fast.')

  const items = await roomQueue(payload, room.id)
  const queued = items.filter((i) => i.state === 'queued')
  if (queued.length >= QUEUE_CAP) return fail('The queue is full.')

  const song = await getChannelVideo(videoId.trim())
  if (!song) return fail('That video is not available from this channel.')

  const created = await payload.create({
    collection: 'videoke-queue-items',
    data: {
      room: room.id,
      videoId: song.videoId,
      title: song.title || 'Untitled',
      thumbnail: song.thumbnail || undefined,
      durationSec: song.durationSec ?? undefined,
      addedBy: user.id,
      state: 'queued',
      position: Math.max(0, ...items.map((i) => i.position)) + 1,
    },
    user,
    overrideAccess: false,
  })

  // Auto-start when the stage is idle — songs should roll without the host
  // having to press play first.
  let next: VideokeRoom = room
  if (!relId(room.playback?.item)) {
    const head = nextQueued([...items, created])
    if (head) {
      await payload.update({
        collection: 'videoke-queue-items',
        id: head.id,
        data: { state: 'playing' },
        overrideAccess: true,
      })
      next = await payload.update({
        collection: 'videoke-rooms',
        id: room.id,
        data: {
          playback: {
            item: head.id,
            state: 'playing',
            startedAt: new Date().toISOString(),
            positionSec: 0,
          },
        },
        overrideAccess: true,
      })
    }
  }

  pokeRoom(next)
  return { ok: true, room: await serialize(payload, next) }
}

export async function removeVideokeSong(roomId: number, itemId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)

  const item = await payload
    .findByID({
      collection: 'videoke-queue-items',
      id: itemId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!item || relId(item.room) !== room.id) return fail('Song not found.')
  if (item.state !== 'queued') return fail('Only queued songs can be removed.')
  if (relId(item.addedBy) !== user.id && relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the adder or the host can remove this song.')
  }

  await payload.delete({ collection: 'videoke-queue-items', id: item.id })
  pokeRoom(room)
  return { ok: true, room: await serialize(payload, room) }
}

export async function reorderVideokeQueue(
  roomId: number,
  itemIds: number[],
): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can reorder the queue.')
  }

  const items = await roomQueue(payload, room.id)
  const queued = items.filter((i) => i.state === 'queued')
  const queuedIds = new Set(queued.map((i) => i.id))
  const order = itemIds.filter((id) => queuedIds.has(id))
  // Any queued item missing from the submitted order keeps its tail spot.
  const rest = queued.filter((i) => !order.includes(i.id)).map((i) => i.id)
  const finalOrder = [...order, ...rest]

  for (let i = 0; i < finalOrder.length; i++) {
    await payload.update({
      collection: 'videoke-queue-items',
      id: finalOrder[i],
      data: { position: i + 1 },
      overrideAccess: true,
    })
  }
  pokeRoom(room)
  return { ok: true, room: await serialize(payload, room) }
}

// ── Host playback controls ─────────────────────────────────────────────────

const loadHostRoom = async (
  payload: PayloadClient,
  roomId: number,
  user: User,
): Promise<VideokeRoom | string> => {
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return room
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return 'Only the host controls playback.'
  }
  return room
}

const nextQueued = (items: VideokeQueueItem[]) =>
  items.filter((i) => i.state === 'queued').sort((a, b) => a.position - b.position)[0] ?? null

export async function videokePlay(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadHostRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)

  const playback = room.playback ?? {}
  const items = await roomQueue(payload, room.id)

  if (playback.state === 'paused' && relId(playback.item)) {
    // Resume — keep the stored offset, stamp a fresh start time.
    const next = await payload.update({
      collection: 'videoke-rooms',
      id: room.id,
      data: { playback: { ...playback, state: 'playing', startedAt: new Date().toISOString() } },
      overrideAccess: true,
    })
    pokeRoom(next)
    return { ok: true, room: await serialize(payload, next) }
  }

  const candidate = items.find((i) => i.id === relId(playback.item)) ?? nextQueued(items)
  if (!candidate) return fail('The queue is empty — add a song first.')
  if (candidate.state !== 'playing') {
    await payload.update({
      collection: 'videoke-queue-items',
      id: candidate.id,
      data: { state: 'playing' },
      overrideAccess: true,
    })
  }
  const next = await payload.update({
    collection: 'videoke-rooms',
    id: room.id,
    data: {
      playback: {
        item: candidate.id,
        state: 'playing',
        startedAt: new Date().toISOString(),
        positionSec: 0,
      },
    },
    overrideAccess: true,
  })
  pokeRoom(next)
  return { ok: true, room: await serialize(payload, next) }
}

export async function videokePause(roomId: number, positionSec: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadHostRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  if (room.playback?.state !== 'playing') return fail('Nothing is playing.')

  const next = await payload.update({
    collection: 'videoke-rooms',
    id: room.id,
    data: {
      playback: {
        ...room.playback,
        state: 'paused',
        startedAt: null,
        positionSec: Math.max(0, Number(positionSec) || 0),
      },
    },
    overrideAccess: true,
  })
  pokeRoom(next)
  return { ok: true, room: await serialize(payload, next) }
}

// Natural end and manual skip share one path — `skipped` only changes the
// label stamped on the departing queue row. Every member's player can report
// ENDED (playback must not depend on the host being present), so
// `expectedItemId` makes the advance idempotent: callers pass the item they
// saw finish, and calls landing after the room already moved on no-op.
export async function videokeAdvance(
  roomId: number,
  skipped = false,
  expectedItemId?: number | null,
): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)

  const currentId = relId(room.playback?.item)
  if (expectedItemId != null && currentId !== expectedItemId) return { ok: true }
  if (skipped && relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host controls playback.')
  }

  const items = await roomQueue(payload, room.id)
  if (currentId) {
    const current = items.find((i) => i.id === currentId)
    if (current && current.state !== 'done') {
      await payload.update({
        collection: 'videoke-queue-items',
        id: current.id,
        data: { state: skipped ? 'skipped' : 'done' },
        overrideAccess: true,
      })
    }
  }

  const nextSong = nextQueued(items.filter((i) => i.id !== currentId))
  const next = await payload.update({
    collection: 'videoke-rooms',
    id: room.id,
    data: {
      playback: nextSong
        ? {
            item: nextSong.id,
            state: 'playing',
            startedAt: new Date().toISOString(),
            positionSec: 0,
          }
        : { item: null, state: 'idle', startedAt: null, positionSec: 0 },
    },
    overrideAccess: true,
  })
  if (nextSong) {
    await payload.update({
      collection: 'videoke-queue-items',
      id: nextSong.id,
      data: { state: 'playing' },
      overrideAccess: true,
    })
  }
  pokeRoom(next)
  return { ok: true, room: await serialize(payload, next) }
}

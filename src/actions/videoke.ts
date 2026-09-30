'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'

import { getCurrentUser } from '@/lib/auth'
import { getMutualFollowIds } from '@/lib/chat'
import { pushLive } from '@/lib/live'
import {
  livekitConfigured,
  micHolderIds,
  mintVoiceToken,
  updateVoicePublishers,
} from '@/lib/livekit'
import { revalidateNavCounts } from '@/lib/nav-cache'
import { getPayloadClient } from '@/lib/payload'
import { checkRate } from '@/lib/rate-limit'
import { avatarUrl, relId } from '@/lib/serialize'
import type { MutualHead } from '@/lib/mutuals'
import {
  roomDisplayName,
  roomMemberIds,
  serializeVideokeRoom,
  serializeVideokeSummary,
  type VideokeGateData,
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

// Pending knocks on a room — `hangout_request` notifications double as the
// request store, so they're readable by the host and disposable when
// answered. Depth 2: the actor's avatar lives one hop past the user doc.
const joinRequestsOf = async (payload: PayloadClient, room: VideokeRoom) => {
  const { docs } = await payload.find({
    collection: 'notifications',
    where: {
      and: [{ type: { equals: 'hangout_request' } }, { videokeRoom: { equals: room.id } }],
    },
    sort: 'createdAt',
    limit: 50,
    depth: 2,
    overrideAccess: true,
  })
  // One row per knocker — a user can knock again once their first request is
  // read, and both notifications would otherwise list them twice.
  const seen = new Set<number>()
  return docs.flatMap((n): MutualHead[] => {
    const actor = n.actor
    if (typeof actor !== 'object' || actor === null || seen.has(actor.id)) return []
    seen.add(actor.id)
    return [
      {
        id: actor.id,
        name: actor.name,
        username: actor.username,
        avatarUrl: avatarUrl(actor) ?? null,
      },
    ]
  })
}

// Room serialization plus the host-only join-request list — `user` is the
// action caller, so non-hosts never even pay for the query.
const serializeFor = async (payload: PayloadClient, room: VideokeRoom, user: User) => {
  const data = await serialize(payload, room)
  if (relId(room.host) === user.id || user.role === 'admin') {
    data.requests = await joinRequestsOf(payload, room)
  }
  return data
}

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
  discover: VideokeRoomSummary[]
}> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const mutuals = await getMutualFollowIds(payload, user.id)

  const [rooms, invited, hosted] = await Promise.all([
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
    // Open rooms run by mutuals — the card is only name/host/count, so a
    // system read is safe; the user still can't open the room itself.
    mutuals.length === 0
      ? Promise.resolve({ docs: [] as VideokeRoom[] })
      : payload.find({
          collection: 'videoke-rooms',
          where: { and: [{ host: { in: mutuals } }, { status: { equals: 'open' } }] },
          sort: '-updatedAt',
          limit: 50,
          depth: 0,
          overrideAccess: true,
        }),
  ])

  // Skip rooms the viewer is already a party to (member or invited).
  const discover = hosted.docs.filter(
    (r) => !memberIdsOf(r).includes(user.id) && !inviteeIdsOf(r).includes(user.id),
  )

  const all = [...rooms.docs, ...invited.docs, ...discover]
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

  // Rooms the viewer already knocked on — same unread-notification rule the
  // room gate uses, so the card shows "Requested" instead of re-asking.
  const knocks =
    discover.length === 0
      ? new Set<number>()
      : new Set(
          (
            await payload.find({
              collection: 'notifications',
              where: {
                and: [
                  { type: { equals: 'hangout_request' } },
                  { actor: { equals: user.id } },
                  { videokeRoom: { in: discover.map((r) => r.id) } },
                  { read: { equals: false } },
                ],
              },
              limit: 50,
              depth: 0,
              overrideAccess: true,
            })
          ).docs.map((n) => relId(n.videokeRoom)),
        )

  return {
    rooms: await Promise.all(
      rooms.docs.map((r) => serializeVideokeSummary(payload, r, playingByRoom.get(r.id) ?? null)),
    ),
    invites: await Promise.all(
      invited.docs.map((r) =>
        serializeVideokeSummary(payload, r, playingByRoom.get(r.id) ?? null, user.id),
      ),
    ),
    discover: await Promise.all(
      discover.map(async (r) => ({
        ...(await serializeVideokeSummary(payload, r, playingByRoom.get(r.id) ?? null)),
        asked: knocks.has(r.id),
      })),
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

  // Hosts become members through the create hook, not the invite path — so
  // record the join here too or their hangout never shows in the activities
  // feed.
  await payload.create({
    collection: 'hangout-joins',
    data: { user: user.id, room: room.id, kind: 'hosted' },
    overrideAccess: true,
  })

  // Mutuals can discover this room — nudge their lobbies.
  const mutuals = await getMutualFollowIds(payload, user.id)
  if (mutuals.length) pushLive(mutuals, { type: 'videoke:update', roomId: room.id })

  return { ok: true, roomId: room.id }
}

// ── Room state ─────────────────────────────────────────────────────────────

export async function getVideokeRoom(roomId: number): Promise<VideokeRoomData | null> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return null
  return serializeFor(payload, room, user)
}

// ── Invites ────────────────────────────────────────────────────────────────

export async function inviteToVideoke(roomId: number, targetIds: number[]): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return fail('Room not found.')
  if (room.status !== 'open') return fail('This room has ended.')
  if (relId(room.host) !== user.id) return fail('Only the host can invite.')

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

  await Promise.all([
    ...targets.map((id) =>
      payload.create({
        collection: 'notifications',
        data: {
          recipient: id,
          actor: user.id,
          type: 'hangout_invite',
          videokeRoom: room.id,
        },
      }),
    ),
    // Inviting someone who knocked answers their request — drop it so the
    // host's request list and their own "asked" state clear at once.
    payload.delete({
      collection: 'notifications',
      where: {
        and: [
          { type: { equals: 'hangout_request' } },
          { actor: { in: targets } },
          { videokeRoom: { equals: room.id } },
        ],
      },
      overrideAccess: true,
    }),
  ])
  for (const id of targets) revalidateNavCounts(id)

  pushLive(targets, {
    type: 'videoke:invite',
    roomId: room.id,
    roomName: roomDisplayName(room, user.name),
    from: user.name,
  })
  pushLive(memberIdsOf(next), { type: 'videoke:update', roomId: room.id })
  return { ok: true, room: await serializeFor(payload, next, user) }
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

  // Record the join for the activities feed — one row per (user, room); a
  // re-join bumps the row so it resurfaces instead of duplicating.
  const invitedBy = relId(myInvite.invitedBy)
  const existing = await payload.find({
    collection: 'hangout-joins',
    where: { and: [{ user: { equals: user.id } }, { room: { equals: room.id } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'hangout-joins',
      id: existing.docs[0].id,
      data: { invitedBy, kind: 'joined' },
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'hangout-joins',
      data: { user: user.id, room: room.id, invitedBy, kind: 'joined' },
      overrideAccess: true,
    })
  }

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
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

  await payload.update({
    collection: 'videoke-rooms',
    id: room.id,
    data: {
      status: 'ended',
      // Pending invites die with the room — an unanswered invite shouldn't
      // keep granting read access to a finished hangout.
      invites: [],
      playback: { item: null, state: 'idle', startedAt: null, positionSec: 0 },
    },
    overrideAccess: true,
  })
  // Any knock on a dead room is moot — drop the request notifications so the
  // host isn't asked to approve entry to a finished hangout.
  await payload.delete({
    collection: 'notifications',
    where: {
      and: [{ type: { equals: 'hangout_request' } }, { videokeRoom: { equals: room.id } }],
    },
    overrideAccess: true,
  })
  // Poke the pre-update doc — `next` cleared invites, and those invitees
  // still need the push so an open invite card swaps to the ended gate.
  pokeRoom(room)
  // Drop it from mutuals' discover lists too.
  const mutuals = await getMutualFollowIds(payload, relId(room.host) ?? user.id)
  if (mutuals.length) pushLive(mutuals, { type: 'videoke:update', roomId: room.id })
  return { ok: true }
}

// ── Re-entry (knock) ───────────────────────────────────────────────────────

// What a non-member sees at /hangouts/videoke/[id] — a name, a host, and
// whether knocking is possible. Read with system access because the caller
// has, by definition, no room access; only safe display fields leave here.
export async function getVideokeGate(roomId: number): Promise<VideokeGateData> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await payload
    .findByID({ collection: 'videoke-rooms', id: roomId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const none: VideokeGateData = {
    exists: false,
    open: false,
    name: null,
    hostName: null,
    canAsk: false,
    asked: false,
  }
  if (!room) return none

  const hostId = relId(room.host)
  const open = room.status === 'open'
  const host = hostId
    ? await payload
        .findByID({ collection: 'users', id: hostId, depth: 1, overrideAccess: true })
        .catch(() => null)
    : null

  const isParty = memberIdsOf(room).includes(user.id) || inviteeIdsOf(room).includes(user.id)
  let canAsk = false
  let asked = false
  if (open && !isParty && hostId && hostId !== user.id) {
    const mutuals = await getMutualFollowIds(payload, user.id)
    canAsk = mutuals.includes(hostId)
    if (canAsk) {
      const pending = await payload.find({
        collection: 'notifications',
        where: {
          and: [
            { type: { equals: 'hangout_request' } },
            { actor: { equals: user.id } },
            { videokeRoom: { equals: room.id } },
            { read: { equals: false } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      asked = pending.totalDocs > 0
    }
  }

  return {
    exists: true,
    open,
    name: roomDisplayName(room, host?.name),
    hostName: host?.name ?? null,
    canAsk,
    asked,
  }
}

// A member who left (or a mutual who found the link) knocks — the host gets
// a notification and can let them in through the normal invite path.
export async function requestVideokeJoin(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  if (!checkRate(`vreq:${user.id}`, 10, 60 * 60_000)) {
    return fail('Asking too fast — try again later.')
  }
  const payload = await getPayloadClient()
  const room = await payload
    .findByID({ collection: 'videoke-rooms', id: roomId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!room) return fail('Room not found.')
  if (room.status !== 'open') return fail('This room has ended.')
  if (memberIdsOf(room).includes(user.id)) return fail('You are already in this room.')
  if (inviteeIdsOf(room).includes(user.id)) {
    return fail('You already have an invite — open the room to join.')
  }
  const hostId = relId(room.host)
  if (!hostId || hostId === user.id) return fail('Room not found.')
  const mutuals = await getMutualFollowIds(payload, user.id)
  if (!mutuals.includes(hostId)) return fail('Only mutuals of the host can ask to join.')

  // One outstanding knock per (user, room) — re-asking while the host has an
  // unread request is a no-op; once it's read they can knock again.
  const pending = await payload.find({
    collection: 'notifications',
    where: {
      and: [
        { type: { equals: 'hangout_request' } },
        { actor: { equals: user.id } },
        { videokeRoom: { equals: room.id } },
        { read: { equals: false } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (pending.totalDocs > 0) return { ok: true }

  await payload.create({
    collection: 'notifications',
    data: {
      recipient: hostId,
      actor: user.id,
      type: 'hangout_request',
      videokeRoom: room.id,
    },
  })
  revalidateNavCounts(hostId)

  const host = await payload
    .findByID({ collection: 'users', id: hostId, depth: 0, overrideAccess: true })
    .catch(() => null)
  pushLive(hostId, {
    type: 'videoke:request',
    roomId: room.id,
    roomName: roomDisplayName(room, host?.name),
    from: user.name,
  })
  // The knock also lands in the host's "Asking to join" list — that panel is
  // room state, so poke the host's open room view as well.
  pushLive(hostId, { type: 'videoke:update', roomId: room.id })
  return { ok: true }
}

// ── Voice (LiveKit) ────────────────────────────────────────────────────────

// Who may hold the mic right now: the host plus whoever queued the currently
// playing song. The SFU enforces the grant — a member's token is minted with
// canPublish, and when the song turns over we update connected participants
// through the admin API. Best-effort like pushLive — a missed sync must not
// fail the underlying mutation; callers without a request context (tests)
// fall back to a floating promise.
const syncVoicePublishers = (payload: PayloadClient, room: VideokeRoom) => {
  if (!livekitConfigured()) return
  const run = async () => {
    const items = await roomQueue(payload, room.id)
    await updateVoicePublishers(room.id, memberIdsOf(room), micHolderIds(room, items))
  }
  try {
    after(run)
  } catch {
    void run().catch(() => {})
  }
}

// Mint a scoped access token so a member can join the room's LiveKit voice
// channel (`videoke-{id}`). Members of an open room only — the SFU itself
// does no app-auth, so the token is the whole gate. `null` means voice is
// either off for this deployment or the caller isn't allowed in.
export async function getVideokeVoiceTicket(
  roomId: number,
): Promise<{ token: string; url: string; expiresAt: number } | null> {
  const user = await requireUser()
  if (!livekitConfigured()) return null
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room || room.status !== 'open' || !memberIdsOf(room).includes(user.id)) return null

  const items = await roomQueue(payload, room.id)
  return mintVoiceToken(user, room.id, micHolderIds(room, items).has(user.id))
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
      syncVoicePublishers(payload, next)
    }
  }

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
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
  return { ok: true, room: await serializeFor(payload, room, user) }
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
  return { ok: true, room: await serializeFor(payload, room, user) }
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
    return { ok: true, room: await serializeFor(payload, next, user) }
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
  syncVoicePublishers(payload, next)
  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
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
  return { ok: true, room: await serializeFor(payload, next, user) }
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
  syncVoicePublishers(payload, next)
  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

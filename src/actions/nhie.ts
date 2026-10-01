'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getMutualFollowIds } from '@/lib/chat'
import { awardPoints } from '@/lib/gamification'
import { hangoutGateError, type OpenHangout } from '@/lib/hangouts'
import { pushLive } from '@/lib/live'
import { livekitConfigured, mintVoiceToken } from '@/lib/livekit'
import type { MutualHead } from '@/lib/mutuals'
import { revalidateNavCounts } from '@/lib/nav-cache'
import {
  advanceTurn,
  allAnswered,
  applyAnswer,
  dealGame,
  isFinished,
  nextActiveSeat,
  pickDeckPrompt,
  removePlayer,
  setCustomPrompt,
  skipTurn,
  winnerId,
  CUSTOM_PROMPT_MAX,
  START_FINGERS,
  type NhieAnswer,
  type NhieState,
} from '@/lib/nhie'
import {
  nhieDisplayName,
  nhieEngineState,
  nhieRoomMemberIds,
  serializeNhieRoom,
  serializeNhieSummary,
  type NhieGateData,
  type NhieRoomData,
  type NhieRoomSummary,
} from '@/lib/nhieRooms'
import { getPayloadClient } from '@/lib/payload'
import { checkRate } from '@/lib/rate-limit'
import { avatarUrl, relId } from '@/lib/serialize'
import type { NhieRoom, User } from '@/payload-types'

const ROOM_MEMBER_CAP = 10 // a circle still reads well at ten
const INVITE_CAP = 20 // per call

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>
type ActionResult =
  { ok: true; room?: NhieRoomData } | { ok: false; error: string; busyHangout?: OpenHangout }

const fail = (error: string): ActionResult => ({ ok: false, error })

// Rewrite persisted invite rows for an update payload — drops any row whose
// user reference can't be resolved.
const inviteRows = (room: NhieRoom) =>
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

const memberIdsOf = (room: NhieRoom) => nhieRoomMemberIds(room)
const inviteeIdsOf = (room: NhieRoom) =>
  (room.invites ?? []).map((i) => relId(i.user)).filter((id): id is number => id !== null)

// Load a room the current user can see. The collection's party-scoped read
// access strips `game.responses` for non-admins, so this reads with system
// access after checking membership/invitee status in code — the serializer
// then decides which answers leave the server.
const loadVisibleRoom = async (
  payload: PayloadClient,
  roomId: number,
  user: User,
): Promise<NhieRoom | null> => {
  const room = await payload
    .findByID({ collection: 'nhie-rooms', id: roomId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!room) return null
  if (memberIdsOf(room).includes(user.id) || inviteeIdsOf(room).includes(user.id)) return room
  if (user.role === 'admin') return room
  return null
}

const serialize = (payload: PayloadClient, room: NhieRoom, user: User) =>
  serializeNhieRoom(payload, room, user)

// Pending knocks on a room — `hangout_request` notifications double as the
// request store, so they're readable by the host and disposable when
// answered. Depth 2: the actor's avatar lives one hop past the user doc.
const joinRequestsOf = async (payload: PayloadClient, room: NhieRoom) => {
  const { docs } = await payload.find({
    collection: 'notifications',
    where: {
      and: [{ type: { equals: 'hangout_request' } }, { nhieRoom: { equals: room.id } }],
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
const serializeFor = async (payload: PayloadClient, room: NhieRoom, user: User) => {
  const data = await serialize(payload, room, user)
  if (relId(room.host) === user.id || user.role === 'admin') {
    data.requests = await joinRequestsOf(payload, room)
  }
  return data
}

const pokeRoom = (room: NhieRoom, extraTargets: number[] = []) => {
  pushLive([...new Set([...memberIdsOf(room), ...inviteeIdsOf(room), ...extraTargets])], {
    type: 'nhie:update',
    roomId: room.id,
  })
}

const requireUser = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

// ── Lobby ──────────────────────────────────────────────────────────────────

export async function getNhieLobby(): Promise<{
  rooms: NhieRoomSummary[]
  invites: NhieRoomSummary[]
  discover: NhieRoomSummary[]
}> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const mutuals = await getMutualFollowIds(payload, user.id)

  const [rooms, invited, hosted] = await Promise.all([
    payload.find({
      collection: 'nhie-rooms',
      where: { and: [{ members: { contains: user.id } }, { status: { equals: 'open' } }] },
      sort: '-updatedAt',
      limit: 50,
      depth: 0,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'nhie-rooms',
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
      ? Promise.resolve({ docs: [] as NhieRoom[] })
      : payload.find({
          collection: 'nhie-rooms',
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
                  { nhieRoom: { in: discover.map((r) => r.id) } },
                  { read: { equals: false } },
                ],
              },
              limit: 50,
              depth: 0,
              overrideAccess: true,
            })
          ).docs.map((n) => relId(n.nhieRoom)),
        )

  return {
    rooms: await Promise.all(rooms.docs.map((r) => serializeNhieSummary(payload, r))),
    invites: await Promise.all(invited.docs.map((r) => serializeNhieSummary(payload, r, user.id))),
    discover: await Promise.all(
      discover.map(async (r) => ({
        ...(await serializeNhieSummary(payload, r)),
        asked: knocks.has(r.id),
      })),
    ),
  }
}

export async function createNhieRoom(
  name: string,
  switchRoom = false,
): Promise<ActionResult & { roomId?: number }> {
  const user = await requireUser()
  if (!checkRate(`nroom-create:${user.id}`, 5, 60 * 60_000)) {
    return fail('Too many rooms — try again later.')
  }
  const payload = await getPayloadClient()
  const gate = await hangoutGateError(payload, user.id, switchRoom)
  if (gate) return { ok: false, ...gate }
  const room = await payload.create({
    collection: 'nhie-rooms',
    data: {
      host: user.id,
      name: name.trim().slice(0, 80) || undefined,
      members: [user.id],
      invites: [],
      status: 'open',
      game: { state: 'lobby' },
    },
    user,
    overrideAccess: false,
  })

  // Hosts become members through the create hook, not the invite path — so
  // record the join here too or their hangout never shows in the activities
  // feed.
  await payload.create({
    collection: 'hangout-joins',
    data: { user: user.id, nhieRoom: room.id, kind: 'hosted' },
    overrideAccess: true,
  })

  // Mutuals can discover this room — nudge their lobbies.
  const mutuals = await getMutualFollowIds(payload, user.id)
  if (mutuals.length) pushLive(mutuals, { type: 'nhie:update', roomId: room.id })

  return { ok: true, roomId: room.id }
}

// ── Room state ─────────────────────────────────────────────────────────────

export async function getNhieRoom(roomId: number): Promise<NhieRoomData | null> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return null
  return serializeFor(payload, room, user)
}

// ── Invites ────────────────────────────────────────────────────────────────

export async function inviteToNhie(roomId: number, targetIds: number[]): Promise<ActionResult> {
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
    return fail('This circle is full.')
  }

  const next = await payload.update({
    collection: 'nhie-rooms',
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
          nhieRoom: room.id,
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
          { nhieRoom: { equals: room.id } },
        ],
      },
      overrideAccess: true,
    }),
  ])
  for (const id of targets) revalidateNavCounts(id)

  pushLive(targets, {
    type: 'nhie:invite',
    roomId: room.id,
    roomName: nhieDisplayName(room, user.name),
    from: user.name,
  })
  pushLive(memberIdsOf(next), { type: 'nhie:update', roomId: room.id })
  return { ok: true, room: await serializeFor(payload, next, user) }
}

export async function respondNhieInvite(
  roomId: number,
  accept: boolean,
  switchRoom = false,
): Promise<ActionResult> {
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
      collection: 'nhie-rooms',
      id: room.id,
      data: { invites: remainingInvites },
      overrideAccess: true,
    })
    pushLive(memberIdsOf(next), { type: 'nhie:update', roomId: room.id })
    return { ok: true }
  }

  if (memberIdsOf(room).length >= ROOM_MEMBER_CAP) return fail('This circle is full.')
  const gate = await hangoutGateError(payload, user.id, switchRoom)
  if (gate) return { ok: false, ...gate }

  const next = await payload.update({
    collection: 'nhie-rooms',
    id: room.id,
    data: { invites: remainingInvites, members: [...memberIdsOf(room), user.id] },
    overrideAccess: true,
  })

  // Record the join for the activities feed — one row per (user, room); a
  // re-join bumps the row so it resurfaces instead of duplicating.
  const invitedBy = relId(myInvite.invitedBy)
  const existing = await payload.find({
    collection: 'hangout-joins',
    where: { and: [{ user: { equals: user.id } }, { nhieRoom: { equals: room.id } }] },
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
      data: { user: user.id, nhieRoom: room.id, invitedBy, kind: 'joined' },
      overrideAccess: true,
    })
  }

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

// ── Membership lifecycle ───────────────────────────────────────────────────

type SeatRow = { user: number }
type FingerRow = { user: number; count: number }
type ResponseRow = { user: number; answer: NhieAnswer }

const gameData = (room: NhieRoom) => room.game

const gameRows = (state: NhieState) => ({
  seats: state.seats.map((id): SeatRow => ({ user: id })),
  fingers: state.seats.map((id): FingerRow => ({ user: id, count: state.fingers[id] ?? 0 })),
  responses: Object.entries(state.responses).map(([uid, answer]): ResponseRow => ({
    user: Number(uid),
    answer,
  })),
  turnSeat: state.turnSeat,
  usedPrompts: state.usedPrompts,
})

// A seated player leaving mid-game: their seat leaves the rotation, and a
// pending answer requirement drops with them — which can resolve the circle
// or end the game outright (last holder walked away).
const applyLeaveToGame = (room: NhieRoom, userId: number) => {
  const game = room.game
  if (game?.state !== 'playing') return null
  const seats = (game.seats ?? [])
    .map((s) => relId(s.user))
    .filter((id): id is number => id !== null)
  if (!seats.includes(userId)) return null

  const result = removePlayer(nhieEngineState(room), userId)
  const finished = isFinished(result.state)
  const winner = finished ? winnerId(result.state) : null
  return {
    state: result.state,
    resolved: result.resolved,
    dropped: result.dropped,
    finished,
    winner,
  }
}

export async function leaveNhieRoom(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room || !memberIdsOf(room).includes(user.id)) return fail('You are not in this room.')

  // Host leaving ends the room for everyone — no host transfer in v1.
  if (relId(room.host) === user.id) return endNhieRoom(roomId)

  const gamePatch = applyLeaveToGame(room, user.id)
  const next = await payload.update({
    collection: 'nhie-rooms',
    id: room.id,
    data: {
      members: memberIdsOf(room).filter((id) => id !== user.id),
      ...(gamePatch
        ? {
            game: {
              ...room.game,
              state: gamePatch.finished ? 'finished' : 'playing',
              ...gameRows(gamePatch.state),
              prompt: gamePatch.state.prompt
                ? {
                    text: gamePatch.state.prompt.text,
                    by: gamePatch.state.prompt.by,
                    source: gamePatch.state.prompt.source,
                  }
                : { text: null, by: null, source: 'deck' },
              lastResult: gamePatch.resolved
                ? {
                    text: gamePatch.state.prompt?.text ?? null,
                    drops: gamePatch.dropped,
                  }
                : room.game?.lastResult,
              winner: gamePatch.finished ? gamePatch.winner : null,
            },
          }
        : {}),
    },
    overrideAccess: true,
  })

  // A leave that ended the game pays the winner — same dedupe key as a
  // normal finish so replayed events can't double-pay.
  if (gamePatch?.finished && gamePatch.winner) {
    await awardPoints(
      { payload },
      {
        userId: gamePatch.winner,
        kind: 'nhie-win',
        key: `nhie:${room.id}:${room.game?.round ?? 1}:${gamePatch.winner}`,
      },
    )
  }

  pushLive([...memberIdsOf(next), user.id], { type: 'nhie:update', roomId: room.id })
  return { ok: true }
}

export async function endNhieRoom(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return fail('Room not found.')
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can end the room.')
  }
  if (room.status === 'ended') return { ok: true }

  await payload.update({
    collection: 'nhie-rooms',
    id: room.id,
    data: {
      status: 'ended',
      // Pending invites die with the room — an unanswered invite shouldn't
      // keep granting read access to a finished hangout.
      invites: [],
    },
    overrideAccess: true,
  })
  // Any knock on a dead room is moot — drop the request notifications so the
  // host isn't asked to approve entry to a finished hangout.
  await payload.delete({
    collection: 'notifications',
    where: {
      and: [{ type: { equals: 'hangout_request' } }, { nhieRoom: { equals: room.id } }],
    },
    overrideAccess: true,
  })
  // Poke the pre-update doc — `next` cleared invites, and those invitees
  // still need the push so an open invite card swaps to the ended gate.
  pokeRoom(room)
  // Drop it from mutuals' discover lists too.
  const mutuals = await getMutualFollowIds(payload, relId(room.host) ?? user.id)
  if (mutuals.length) pushLive(mutuals, { type: 'nhie:update', roomId: room.id })
  return { ok: true }
}

// ── Re-entry (knock) ───────────────────────────────────────────────────────

// What a non-member sees at /hangouts/nhie/[id] — a name, a host, and
// whether knocking is possible. Read with system access because the caller
// has, by definition, no room access; only safe display fields leave here.
export async function getNhieGate(roomId: number): Promise<NhieGateData> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await payload
    .findByID({ collection: 'nhie-rooms', id: roomId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const none: NhieGateData = {
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
            { nhieRoom: { equals: room.id } },
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
    name: nhieDisplayName(room, host?.name),
    hostName: host?.name ?? null,
    canAsk,
    asked,
  }
}

// A member who left (or a mutual who found the link) knocks — the host gets
// a notification and can let them in through the normal invite path.
export async function requestNhieJoin(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  if (!checkRate(`nreq:${user.id}`, 10, 60 * 60_000)) {
    return fail('Asking too fast — try again later.')
  }
  const payload = await getPayloadClient()
  const room = await payload
    .findByID({ collection: 'nhie-rooms', id: roomId, depth: 0, overrideAccess: true })
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
        { nhieRoom: { equals: room.id } },
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
      nhieRoom: room.id,
    },
  })
  revalidateNavCounts(hostId)

  const host = await payload
    .findByID({ collection: 'users', id: hostId, depth: 0, overrideAccess: true })
    .catch(() => null)
  pushLive(hostId, {
    type: 'nhie:request',
    roomId: room.id,
    roomName: nhieDisplayName(room, host?.name),
    from: user.name,
  })
  // The knock also lands in the host's "Asking to join" list — that panel is
  // room state, so poke the host's open room view as well.
  pushLive(hostId, { type: 'nhie:update', roomId: room.id })
  return { ok: true }
}

// ── Voice (LiveKit) ────────────────────────────────────────────────────────

// Mint a scoped access token so a member can join the room's LiveKit voice
// channel (`nhie-{id}`). Every member may talk — seated or watching, it's
// still a hangout — so canPublish is true for all. `null` means voice is
// either off for this deployment or the caller isn't allowed in.
export async function getNhieVoiceTicket(
  roomId: number,
): Promise<{ token: string; url: string; expiresAt: number } | null> {
  const user = await requireUser()
  if (!livekitConfigured()) return null
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room || room.status !== 'open' || !memberIdsOf(room).includes(user.id)) return null

  return mintVoiceToken(user, room.id, true, 'nhie')
}

// ── Never Have I Ever game actions ─────────────────────────────────────────

const loadOpenMemberRoom = async (
  payload: PayloadClient,
  roomId: number,
  user: User,
): Promise<NhieRoom | string> => {
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return 'Room not found.'
  if (room.status !== 'open') return 'This room has ended.'
  if (!memberIdsOf(room).includes(user.id)) return 'You are not in this room.'
  return room
}

// Deal a fresh game for the room's current members — used by both the first
// start and rematches, so seat order re-shuffles each game.
const dealNewGame = async (
  payload: PayloadClient,
  room: NhieRoom,
): Promise<{ next: NhieRoom | null; error?: string }> => {
  const members = memberIdsOf(room)
  if (members.length < 2) return { next: null, error: 'Need at least 2 players to start.' }
  const seats = [...members].sort(() => Math.random() - 0.5)
  const state = dealGame(seats)
  const round = (gameData(room)?.round ?? 0) + 1
  const next = await payload.update({
    collection: 'nhie-rooms',
    id: room.id,
    data: {
      game: {
        state: 'playing',
        round,
        seats: state.seats.map((id): SeatRow => ({ user: id })),
        fingers: state.seats.map((id): FingerRow => ({
          user: id,
          count: state.fingers[id] ?? START_FINGERS,
        })),
        turnSeat: state.turnSeat,
        prompt: { text: null, by: null, source: 'deck' },
        responses: [],
        usedPrompts: [],
        lastResult: { text: null, drops: [] },
        winner: null,
      },
    },
    overrideAccess: true,
  })
  return { next }
}

export async function startNhie(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can start.')
  }
  if (gameData(room)?.state === 'playing') return fail('A game is already in play.')

  const { next, error } = await dealNewGame(payload, room)
  if (!next) return fail(error ?? "Couldn't start the game.")
  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

export async function rematchNhie(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can start.')
  }
  if (gameData(room)?.state !== 'finished') return fail('Finish the game first.')

  const { next, error } = await dealNewGame(payload, room)
  if (!next) return fail(error ?? "Couldn't start the game.")
  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

// The turn owner supplies the prompt — `text` set means a custom statement,
// empty/absent draws one off the deck.
export async function nhiePrompt(roomId: number, text?: string): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  const game = gameData(room)
  if (game?.state !== 'playing') return fail('No game in play.')

  const state = nhieEngineState(room)
  if (state.prompt) return fail('A prompt is already up.')
  const seatIndex = state.seats.indexOf(user.id)
  if (seatIndex !== state.turnSeat) return fail('Not your turn to call a prompt.')

  const custom = typeof text === 'string' ? text.trim().slice(0, CUSTOM_PROMPT_MAX) : ''
  const nextState = custom
    ? setCustomPrompt(state, custom, user.id)
    : pickDeckPrompt(state, user.id).state

  const next = await payload.update({
    collection: 'nhie-rooms',
    id: room.id,
    data: {
      game: {
        ...game,
        prompt: {
          text: nextState.prompt!.text,
          by: user.id,
          source: nextState.prompt!.source,
        },
        responses: [],
        usedPrompts: nextState.usedPrompts,
      },
    },
    overrideAccess: true,
  })

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

export async function nhieAnswer(roomId: number, answer: NhieAnswer): Promise<ActionResult> {
  const user = await requireUser()
  if (answer !== 'have' && answer !== 'never') return fail('Pick an answer first.')
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  const game = gameData(room)
  if (game?.state !== 'playing') return fail('No game in play.')

  const state = nhieEngineState(room)
  const result = applyAnswer(state, user.id, answer)
  if (!result) {
    return fail(
      state.responses[user.id] !== undefined
        ? 'You already answered this one.'
        : 'This prompt isn’t yours to answer — you may be out.',
    )
  }

  const next = await payload.update({
    collection: 'nhie-rooms',
    id: room.id,
    data: {
      game: {
        ...game,
        state: result.finished ? 'finished' : 'playing',
        ...gameRows(result.state),
        prompt: result.state.prompt
          ? {
              text: result.state.prompt.text,
              by: result.state.prompt.by,
              source: result.state.prompt.source,
            }
          : { text: null, by: null, source: 'deck' },
        lastResult: result.resolved
          ? { text: result.state.prompt?.text ?? null, drops: result.dropped }
          : room.game?.lastResult,
        winner: result.finished ? result.winnerId : null,
      },
    },
    overrideAccess: true,
  })

  // The circle resolved and someone survived alone — pay them.
  if (result.finished && result.winnerId !== null) {
    await awardPoints(
      { payload },
      {
        userId: result.winnerId,
        kind: 'nhie-win',
        key: `nhie:${room.id}:${game.round ?? 1}:${result.winnerId}`,
      },
    )
  }

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

// The reveal is acknowledged — the NEXT turn owner (or the host) clears the
// prompt and hands the turn forward.
export async function nhieNext(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  const game = gameData(room)
  if (game?.state !== 'playing') return fail('No game in play.')

  const state = nhieEngineState(room)
  if (!state.prompt || !allAnswered(state)) return fail('The circle is still answering.')

  const nextSeat = nextActiveSeat(state, state.turnSeat)
  const nextOwner = nextSeat !== null ? state.seats[nextSeat] : null
  const isHost = relId(room.host) === user.id
  if (user.id !== nextOwner && !isHost && user.role !== 'admin') {
    return fail('Waiting on the next caller.')
  }

  const nextState = advanceTurn(state)
  if (!nextState) return fail('Nothing to advance.')

  const next = await payload.update({
    collection: 'nhie-rooms',
    id: room.id,
    data: {
      game: {
        ...game,
        turnSeat: nextState.turnSeat,
        prompt: { text: null, by: null, source: 'deck' },
        responses: [],
      },
    },
    overrideAccess: true,
  })

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

// Host skips an idle turn owner (AFK). Only legal before answers start —
// a live circle resolves on its own once everyone still in has answered.
export async function nhieSkipTurn(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can skip a turn.')
  }
  const game = gameData(room)
  if (game?.state !== 'playing') return fail('No game in play.')

  const nextState = skipTurn(nhieEngineState(room))
  if (!nextState) return fail('Nothing to skip — the circle is mid-answer.')

  const next = await payload.update({
    collection: 'nhie-rooms',
    id: room.id,
    data: {
      game: {
        ...game,
        turnSeat: nextState.turnSeat,
        prompt: { text: null, by: null, source: 'deck' },
        responses: [],
      },
    },
    overrideAccess: true,
  })

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

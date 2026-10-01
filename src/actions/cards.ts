'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import {
  cardDisplayName,
  cardRoomMemberIds,
  serializeCardRoom,
  serializeCardSummary,
  type CardGateData,
  type CardRoomData,
  type CardRoomSummary,
} from '@/lib/cards'
import { getMutualFollowIds } from '@/lib/chat'
import { awardPoints } from '@/lib/gamification'
import { hangoutGateError, type OpenHangout } from '@/lib/hangouts'
import { pushLive } from '@/lib/live'
import { livekitConfigured, mintVoiceToken } from '@/lib/livekit'
import type { MutualHead } from '@/lib/mutuals'
import { revalidateNavCounts } from '@/lib/nav-cache'
import { getPayloadClient } from '@/lib/payload'
import { checkRate } from '@/lib/rate-limit'
import { avatarUrl, relId } from '@/lib/serialize'
import {
  applyDraw,
  deal,
  isFinished,
  loserId,
  redistributeForLeave,
  UNGGOY_CARD,
} from '@/lib/unggoy'
import type { CardRoom, User } from '@/payload-types'

const ROOM_MEMBER_CAP = 8 // a 49-card table tops out fast
const INVITE_CAP = 20 // per call

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>
type ActionResult =
  { ok: true; room?: CardRoomData } | { ok: false; error: string; busyHangout?: OpenHangout }

const fail = (error: string): ActionResult => ({ ok: false, error })

// Rewrite persisted invite rows for an update payload — drops any row whose
// user reference can't be resolved.
const inviteRows = (room: CardRoom) =>
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

const memberIdsOf = (room: CardRoom) => cardRoomMemberIds(room)
const inviteeIdsOf = (room: CardRoom) =>
  (room.invites ?? []).map((i) => relId(i.user)).filter((id): id is number => id !== null)

// Load a room the current user can see. The collection's party-scoped read
// access strips `game.hands` for non-admins, so this reads with system
// access after checking membership/invitee status in code — the serializer
// then decides which card contents (only the viewer's) leave the server.
const loadVisibleRoom = async (
  payload: PayloadClient,
  roomId: number,
  user: User,
): Promise<CardRoom | null> => {
  const room = await payload
    .findByID({ collection: 'card-rooms', id: roomId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!room) return null
  if (memberIdsOf(room).includes(user.id) || inviteeIdsOf(room).includes(user.id)) return room
  if (user.role === 'admin') return room
  return null
}

const serialize = (payload: PayloadClient, room: CardRoom, user: User) =>
  serializeCardRoom(payload, room, user)

// Pending knocks on a room — `hangout_request` notifications double as the
// request store, so they're readable by the host and disposable when
// answered. Depth 2: the actor's avatar lives one hop past the user doc.
const joinRequestsOf = async (payload: PayloadClient, room: CardRoom) => {
  const { docs } = await payload.find({
    collection: 'notifications',
    where: {
      and: [{ type: { equals: 'hangout_request' } }, { cardRoom: { equals: room.id } }],
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
const serializeFor = async (payload: PayloadClient, room: CardRoom, user: User) => {
  const data = await serialize(payload, room, user)
  if (relId(room.host) === user.id || user.role === 'admin') {
    data.requests = await joinRequestsOf(payload, room)
  }
  return data
}

const pokeRoom = (room: CardRoom, extraTargets: number[] = []) => {
  pushLive([...new Set([...memberIdsOf(room), ...inviteeIdsOf(room), ...extraTargets])], {
    type: 'cards:update',
    roomId: room.id,
  })
}

const requireUser = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

// ── Lobby ──────────────────────────────────────────────────────────────────

export async function getCardsLobby(): Promise<{
  rooms: CardRoomSummary[]
  invites: CardRoomSummary[]
  discover: CardRoomSummary[]
}> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const mutuals = await getMutualFollowIds(payload, user.id)

  const [rooms, invited, hosted] = await Promise.all([
    payload.find({
      collection: 'card-rooms',
      where: { and: [{ members: { contains: user.id } }, { status: { equals: 'open' } }] },
      sort: '-updatedAt',
      limit: 50,
      depth: 0,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'card-rooms',
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
      ? Promise.resolve({ docs: [] as CardRoom[] })
      : payload.find({
          collection: 'card-rooms',
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
                  { cardRoom: { in: discover.map((r) => r.id) } },
                  { read: { equals: false } },
                ],
              },
              limit: 50,
              depth: 0,
              overrideAccess: true,
            })
          ).docs.map((n) => relId(n.cardRoom)),
        )

  return {
    rooms: await Promise.all(rooms.docs.map((r) => serializeCardSummary(payload, r))),
    invites: await Promise.all(invited.docs.map((r) => serializeCardSummary(payload, r, user.id))),
    discover: await Promise.all(
      discover.map(async (r) => ({
        ...(await serializeCardSummary(payload, r)),
        asked: knocks.has(r.id),
      })),
    ),
  }
}

export async function createCardRoom(
  name: string,
  switchRoom = false,
): Promise<ActionResult & { roomId?: number }> {
  const user = await requireUser()
  if (!checkRate(`croom-create:${user.id}`, 5, 60 * 60_000)) {
    return fail('Too many rooms — try again later.')
  }
  const payload = await getPayloadClient()
  const gate = await hangoutGateError(payload, user.id, switchRoom)
  if (gate) return { ok: false, ...gate }
  const room = await payload.create({
    collection: 'card-rooms',
    data: {
      host: user.id,
      name: name.trim().slice(0, 80) || undefined,
      members: [user.id],
      invites: [],
      status: 'open',
      game: { variant: 'unggoy', state: 'lobby' },
    },
    user,
    overrideAccess: false,
  })

  // Hosts become members through the create hook, not the invite path — so
  // record the join here too or their hangout never shows in the activities
  // feed.
  await payload.create({
    collection: 'hangout-joins',
    data: { user: user.id, cardRoom: room.id, kind: 'hosted' },
    overrideAccess: true,
  })

  // Mutuals can discover this room — nudge their lobbies.
  const mutuals = await getMutualFollowIds(payload, user.id)
  if (mutuals.length) pushLive(mutuals, { type: 'cards:update', roomId: room.id })

  return { ok: true, roomId: room.id }
}

// ── Room state ─────────────────────────────────────────────────────────────

export async function getCardRoom(roomId: number): Promise<CardRoomData | null> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return null
  return serializeFor(payload, room, user)
}

// ── Invites ────────────────────────────────────────────────────────────────

export async function inviteToCards(roomId: number, targetIds: number[]): Promise<ActionResult> {
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
    return fail('This table is full.')
  }

  const next = await payload.update({
    collection: 'card-rooms',
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
          cardRoom: room.id,
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
          { cardRoom: { equals: room.id } },
        ],
      },
      overrideAccess: true,
    }),
  ])
  for (const id of targets) revalidateNavCounts(id)

  pushLive(targets, {
    type: 'cards:invite',
    roomId: room.id,
    roomName: cardDisplayName(room, user.name),
    from: user.name,
  })
  pushLive(memberIdsOf(next), { type: 'cards:update', roomId: room.id })
  return { ok: true, room: await serializeFor(payload, next, user) }
}

export async function respondCardsInvite(
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
      collection: 'card-rooms',
      id: room.id,
      data: { invites: remainingInvites },
      overrideAccess: true,
    })
    pushLive(memberIdsOf(next), { type: 'cards:update', roomId: room.id })
    return { ok: true }
  }

  if (memberIdsOf(room).length >= ROOM_MEMBER_CAP) return fail('This table is full.')
  const gate = await hangoutGateError(payload, user.id, switchRoom)
  if (gate) return { ok: false, ...gate }

  const next = await payload.update({
    collection: 'card-rooms',
    id: room.id,
    data: { invites: remainingInvites, members: [...memberIdsOf(room), user.id] },
    overrideAccess: true,
  })

  // Record the join for the activities feed — one row per (user, room); a
  // re-join bumps the row so it resurfaces instead of duplicating.
  const invitedBy = relId(myInvite.invitedBy)
  const existing = await payload.find({
    collection: 'hangout-joins',
    where: { and: [{ user: { equals: user.id } }, { cardRoom: { equals: room.id } }] },
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
      data: { user: user.id, cardRoom: room.id, invitedBy, kind: 'joined' },
      overrideAccess: true,
    })
  }

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

// ── Membership lifecycle ───────────────────────────────────────────────────

// A seated player leaving mid-round: their pair-free hand is dealt
// round-robin into the hands still in the rotation so the unggoy stays in
// play. Returns the new engine state plus the finish verdict — a leave can
// end the round (last holder walked away with the monkey).
const applyLeaveToGame = (room: CardRoom, userId: number) => {
  const game = room.game
  if (game?.state !== 'playing') return null
  const seats = (game.seats ?? [])
    .map((s) => relId(s.user))
    .filter((id): id is number => id !== null)
  if (!seats.includes(userId)) return null

  const hands: Record<number, string[]> = {}
  for (const row of game.hands ?? []) {
    const id = relId(row.user)
    if (id !== null) {
      hands[id] = Array.isArray(row.cards)
        ? row.cards.filter((c): c is string => typeof c === 'string')
        : []
    }
  }
  // Walking out with the monkey is a loss — the leaver's hand is checked
  // before redistribution dumps it into the survivors' hands.
  const leaverHadUnggoy = (hands[userId] ?? []).includes(UNGGOY_CARD)
  const next = redistributeForLeave({ seats, hands, turnSeat: game.turnSeat ?? 0 }, userId)
  const finished = leaverHadUnggoy || (next.seats.length > 0 && isFinished(next))
  const loser = leaverHadUnggoy ? userId : finished ? loserId(next) : null
  return { state: next, finished, loser }
}

export async function leaveCardRoom(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room || !memberIdsOf(room).includes(user.id)) return fail('You are not in this room.')

  // Host leaving ends the room for everyone — no host transfer in v1.
  if (relId(room.host) === user.id) return endCardRoom(roomId)

  const gamePatch = applyLeaveToGame(room, user.id)
  const next = await payload.update({
    collection: 'card-rooms',
    id: room.id,
    data: {
      members: memberIdsOf(room).filter((id) => id !== user.id),
      ...(gamePatch
        ? {
            game: {
              ...room.game,
              state: gamePatch.finished ? 'finished' : 'playing',
              seats: gamePatch.state.seats.map((id) => ({ user: id })),
              hands: Object.entries(gamePatch.state.hands).map(([uid, cards]) => ({
                user: Number(uid),
                cards,
              })),
              turnSeat: gamePatch.state.turnSeat,
              loser: gamePatch.finished ? gamePatch.loser : null,
            },
          }
        : {}),
    },
    overrideAccess: true,
  })

  // A leave that ended the round pays the remaining seated players — same
  // dedupe key as a normal finish so replayed events can't double-pay.
  if (gamePatch?.finished) {
    const survivors = gamePatch.state.seats.filter((id) => id !== gamePatch.loser)
    await Promise.all(
      survivors.map((userId) =>
        awardPoints(
          { payload },
          {
            userId,
            kind: 'unggoy-win',
            key: `unggoy:${room.id}:${room.game?.round ?? 1}:${userId}`,
          },
        ),
      ),
    )
  }

  pushLive([...memberIdsOf(next), user.id], { type: 'cards:update', roomId: room.id })
  return { ok: true }
}

export async function endCardRoom(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return fail('Room not found.')
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can end the room.')
  }
  if (room.status === 'ended') return { ok: true }

  await payload.update({
    collection: 'card-rooms',
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
      and: [{ type: { equals: 'hangout_request' } }, { cardRoom: { equals: room.id } }],
    },
    overrideAccess: true,
  })
  // Poke the pre-update doc — `next` cleared invites, and those invitees
  // still need the push so an open invite card swaps to the ended gate.
  pokeRoom(room)
  // Drop it from mutuals' discover lists too.
  const mutuals = await getMutualFollowIds(payload, relId(room.host) ?? user.id)
  if (mutuals.length) pushLive(mutuals, { type: 'cards:update', roomId: room.id })
  return { ok: true }
}

// ── Re-entry (knock) ───────────────────────────────────────────────────────

// What a non-member sees at /hangouts/cards/[id] — a name, a host, and
// whether knocking is possible. Read with system access because the caller
// has, by definition, no room access; only safe display fields leave here.
export async function getCardsGate(roomId: number): Promise<CardGateData> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await payload
    .findByID({ collection: 'card-rooms', id: roomId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const none: CardGateData = {
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
            { cardRoom: { equals: room.id } },
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
    name: cardDisplayName(room, host?.name),
    hostName: host?.name ?? null,
    canAsk,
    asked,
  }
}

// A member who left (or a mutual who found the link) knocks — the host gets
// a notification and can let them in through the normal invite path.
export async function requestCardsJoin(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  if (!checkRate(`creq:${user.id}`, 10, 60 * 60_000)) {
    return fail('Asking too fast — try again later.')
  }
  const payload = await getPayloadClient()
  const room = await payload
    .findByID({ collection: 'card-rooms', id: roomId, depth: 0, overrideAccess: true })
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
        { cardRoom: { equals: room.id } },
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
      cardRoom: room.id,
    },
  })
  revalidateNavCounts(hostId)

  const host = await payload
    .findByID({ collection: 'users', id: hostId, depth: 0, overrideAccess: true })
    .catch(() => null)
  pushLive(hostId, {
    type: 'cards:request',
    roomId: room.id,
    roomName: cardDisplayName(room, host?.name),
    from: user.name,
  })
  // The knock also lands in the host's "Asking to join" list — that panel is
  // room state, so poke the host's open room view as well.
  pushLive(hostId, { type: 'cards:update', roomId: room.id })
  return { ok: true }
}

// ── Voice (LiveKit) ────────────────────────────────────────────────────────

// Mint a scoped access token so a member can join the room's LiveKit voice
// channel (`cards-{id}`). Every seated or spectating member may talk — this
// is a hangout, not a stage — so canPublish is true for all. `null` means
// voice is either off for this deployment or the caller isn't allowed in.
export async function getCardsVoiceTicket(
  roomId: number,
): Promise<{ token: string; url: string; expiresAt: number } | null> {
  const user = await requireUser()
  if (!livekitConfigured()) return null
  const payload = await getPayloadClient()
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room || room.status !== 'open' || !memberIdsOf(room).includes(user.id)) return null

  return mintVoiceToken(user, room.id, true, 'cards')
}

// ── Unggoy-Ungguyan game actions ───────────────────────────────────────────

type SeatRow = { user: number }
type HandRow = { user: number; cards: string[] }

const gameData = (room: CardRoom) => room.game

const seatRowsOf = (room: CardRoom): number[] =>
  (gameData(room)?.seats ?? []).map((s) => relId(s.user)).filter((id): id is number => id !== null)

const handsOf = (room: CardRoom): Record<number, string[]> => {
  const hands: Record<number, string[]> = {}
  for (const row of gameData(room)?.hands ?? []) {
    const id = relId(row.user)
    if (id !== null) {
      hands[id] = Array.isArray(row.cards)
        ? row.cards.filter((c): c is string => typeof c === 'string')
        : []
    }
  }
  return hands
}

const loadOpenMemberRoom = async (
  payload: PayloadClient,
  roomId: number,
  user: User,
): Promise<CardRoom | string> => {
  const room = await loadVisibleRoom(payload, roomId, user)
  if (!room) return 'Room not found.'
  if (room.status !== 'open') return 'This room has ended.'
  if (!memberIdsOf(room).includes(user.id)) return 'You are not in this room.'
  return room
}

// Deal a fresh round for the room's current members — used by both the first
// start and rematches, so seat order re-shuffles each round.
const dealRound = async (
  payload: PayloadClient,
  room: CardRoom,
): Promise<{ next: CardRoom | null; error?: string }> => {
  const members = memberIdsOf(room)
  if (members.length < 2) return { next: null, error: 'Need at least 2 players to deal.' }
  const seats = [...members].sort(() => Math.random() - 0.5)
  const state = deal(seats)
  const round = (gameData(room)?.round ?? 0) + 1
  const next = await payload.update({
    collection: 'card-rooms',
    id: room.id,
    data: {
      game: {
        variant: 'unggoy',
        state: 'playing',
        round,
        seats: state.seats.map((id): SeatRow => ({ user: id })),
        hands: state.seats.map((id): HandRow => ({ user: id, cards: state.hands[id] ?? [] })),
        turnSeat: state.turnSeat,
        lastDraw: { by: null, from: null, paired: false },
        loser: null,
      },
    },
    overrideAccess: true,
  })
  return { next }
}

export async function startUnggoy(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can deal.')
  }
  if (gameData(room)?.state === 'playing') return fail('A round is already in play.')

  const { next, error } = await dealRound(payload, room)
  if (!next) return fail(error ?? "Couldn't deal.")
  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

export async function rematchUnggoy(roomId: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  if (relId(room.host) !== user.id && user.role !== 'admin') {
    return fail('Only the host can deal.')
  }
  if (gameData(room)?.state !== 'finished') return fail('Finish the round first.')

  const { next, error } = await dealRound(payload, room)
  if (!next) return fail(error ?? "Couldn't deal.")
  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

// Pay every survivor of a finished round. The dedupe key pins the award to
// (room, round, user), so a double submit or replayed live event can't
// re-pay — and badge evaluation rides the point-events afterChange hook.
const awardSurvivors = async (
  payload: PayloadClient,
  room: CardRoom,
  round: number,
  loserUserId: number,
) => {
  const survivors = seatRowsOf(room).filter((id) => id !== loserUserId)
  await Promise.all(
    survivors.map((userId) =>
      awardPoints(
        { payload },
        { userId, kind: 'unggoy-win', key: `unggoy:${room.id}:${round}:${userId}` },
      ),
    ),
  )
}

// The seat the draw came from, for the lastDraw ticker — same rule the
// engine applies (previous seat with cards, wrapping).
const drawSourceUser = (room: CardRoom, seatIndex: number): number | null => {
  const seats = seatRowsOf(room)
  const hands = handsOf(room)
  for (let i = 1; i < seats.length; i++) {
    const idx = (seatIndex - i + seats.length) % seats.length
    if ((hands[seats[idx]] ?? []).length > 0) return seats[idx]
  }
  return null
}

export async function unggoyDraw(roomId: number, cardIndex: number): Promise<ActionResult> {
  const user = await requireUser()
  const payload = await getPayloadClient()
  const room = await loadOpenMemberRoom(payload, roomId, user)
  if (typeof room === 'string') return fail(room)
  const game = gameData(room)
  if (game?.state !== 'playing') return fail('No round in play.')

  const seats = seatRowsOf(room)
  const seatIndex = seats.indexOf(user.id)
  if (seatIndex === -1) return fail('You are watching this round — next deal seats you.')

  const result = applyDraw(
    { seats, hands: handsOf(room), turnSeat: game.turnSeat ?? 0 },
    seatIndex,
    cardIndex,
  )
  if (!result) return fail('Not your turn — or that card is gone.')

  const next = await payload.update({
    collection: 'card-rooms',
    id: room.id,
    data: {
      game: {
        ...game,
        state: result.finished ? 'finished' : 'playing',
        seats: result.state.seats.map((id): SeatRow => ({ user: id })),
        hands: result.state.seats.map((id): HandRow => ({
          user: id,
          cards: result.state.hands[id] ?? [],
        })),
        turnSeat: result.state.turnSeat,
        lastDraw: {
          by: user.id,
          from: drawSourceUser(room, seatIndex),
          paired: result.paired,
        },
        loser: result.loserId,
      },
    },
    overrideAccess: true,
  })

  if (result.finished && result.loserId !== null) {
    await awardSurvivors(payload, room, game.round ?? 1, result.loserId)
  }

  pokeRoom(next)
  return { ok: true, room: await serializeFor(payload, next, user) }
}

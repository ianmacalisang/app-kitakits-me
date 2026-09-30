import type { Payload } from 'payload'

import type { CardRoom, User } from '@/payload-types'

import type { MutualHead } from './mutuals'
import { avatarUrl, relId } from './serialize'
import { drawSourceSeat, seatsHoldingCards, type CardCode } from './unggoy'

export interface UnggoyPlayer {
  user: MutualHead
  seatIndex: number
  cardCount: number
  /** Hand empty — safe for the round, out of the draw rotation. */
  isOut: boolean
  isTurn: boolean
  /** The hand the current turn-holder draws from. */
  isDrawSource: boolean
}

export interface UnggoyGameData {
  state: 'lobby' | 'playing' | 'finished'
  round: number
  turnSeat: number
  drawFromSeat: number | null
  players: UnggoyPlayer[]
  /** The viewer's own cards — null for spectators and outside a round. */
  myCards: CardCode[] | null
  /** The viewer's seat index — null when they aren't seated this round. */
  mySeat: number | null
  lastDraw: { by: MutualHead | null; from: MutualHead | null; paired: boolean } | null
  loser: MutualHead | null
}

export interface CardInviteData {
  user: MutualHead
  invitedBy: MutualHead | null
}

export interface CardRoomData {
  id: number
  name: string
  status: 'open' | 'ended'
  hostId: number | null
  host: MutualHead | null
  members: MutualHead[]
  invites: CardInviteData[]
  /** Users who knocked and are waiting on the host — host-only. */
  requests?: MutualHead[]
  game: UnggoyGameData
  serverNow: number
}

// What a non-member sees when they land on a room link — enough to render
// the "ask to join" gate without leaking room contents.
export interface CardGateData {
  exists: boolean
  open: boolean
  name: string | null
  hostName: string | null
  /** A knock would be accepted — open room, not a party, mutual of the host. */
  canAsk: boolean
  /** A knock is already pending and unread by the host. */
  asked: boolean
}

export interface CardRoomSummary {
  id: number
  name: string
  status: 'open' | 'ended'
  hostId: number | null
  members: MutualHead[]
  memberCount: number
  gameState: 'lobby' | 'playing' | 'finished'
  round: number
  /** Present on lobby invite cards — who sent the invite. */
  invitedBy: MutualHead | null
  /** Present on lobby discover cards — this user already knocked. */
  asked?: boolean
}

const toHead = (user: User | undefined | null): MutualHead | null =>
  user
    ? {
        id: user.id,
        name: user.name,
        username: user.username,
        avatarUrl: avatarUrl(user) ?? null,
      }
    : null

type SeatRow = { user?: number | User | null }
type HandRow = { user?: number | User | null; cards?: unknown }
type DrawRow = { by?: number | User | null; from?: number | User | null; paired?: boolean | null }

// Fetch every user referenced by a room (host, members, invitees, seats,
// last-draw pair, loser) in one query and hand out MutualHeads — docs are
// loaded at depth 0 upstream, so this is the only population step.
async function headMap(payload: Payload, rooms: CardRoom[]): Promise<Map<number, MutualHead>> {
  const ids = new Set<number>()
  for (const room of rooms) {
    for (const ref of [room.host, ...(room.members ?? [])]) {
      const id = relId(ref)
      if (id) ids.add(id)
    }
    for (const invite of room.invites ?? []) {
      for (const ref of [invite.user, invite.invitedBy]) {
        const id = relId(ref)
        if (id) ids.add(id)
      }
    }
    const game = room.game
    for (const seat of (game?.seats ?? []) as SeatRow[]) {
      const id = relId(seat.user)
      if (id) ids.add(id)
    }
    for (const ref of [game?.loser, game?.lastDraw?.by, game?.lastDraw?.from]) {
      const id = relId(ref)
      if (id) ids.add(id)
    }
  }
  if (ids.size === 0) return new Map()

  const { docs } = await payload.find({
    collection: 'users',
    where: { id: { in: [...ids] } },
    limit: ids.size,
    depth: 1,
    overrideAccess: true,
  })
  const map = new Map<number, MutualHead>()
  for (const doc of docs) {
    const head = toHead(doc)
    if (head) map.set(head.id, head)
  }
  return map
}

export const cardDisplayName = (room: CardRoom, hostName?: string | null) =>
  (typeof room.name === 'string' && room.name.trim()) || `${hostName ?? 'Someone'}'s card game`

const cardsOfRow = (row: HandRow): CardCode[] =>
  Array.isArray(row.cards) ? row.cards.filter((c): c is CardCode => typeof c === 'string') : []

// Read the room's game group into the engine's state shape — seats as user
// ids, hands keyed by user id.
const engineState = (room: CardRoom) => {
  const game = room.game
  const seats = ((game?.seats ?? []) as SeatRow[])
    .map((s) => relId(s.user))
    .filter((id): id is number => id !== null)
  const hands: Record<number, CardCode[]> = {}
  for (const row of (game?.hands ?? []) as HandRow[]) {
    const id = relId(row.user)
    if (id !== null) hands[id] = cardsOfRow(row)
  }
  return { seats, hands, turnSeat: game?.turnSeat ?? 0 }
}

// Per-player serialization — the viewer sees their own cards; everyone else
// is a card count. The room's `hands` field is admin-read-only at the field
// level, so this is the ONLY way members ever see card contents.
export async function serializeCardRoom(
  payload: Payload,
  room: CardRoom,
  forUser: User,
): Promise<CardRoomData> {
  const heads = await headMap(payload, [room])
  const hostId = relId(room.host)
  const state = engineState(room)
  const game = room.game
  const holding = new Set(seatsHoldingCards(state))
  const drawSource = game?.state === 'playing' ? drawSourceSeat(state, state.turnSeat) : null
  const mySeat = state.seats.indexOf(forUser.id)
  const lastDraw = game?.lastDraw as DrawRow | undefined

  return {
    id: room.id,
    name: cardDisplayName(room, heads.get(hostId ?? -1)?.name),
    status: room.status === 'ended' ? 'ended' : 'open',
    hostId,
    host: heads.get(hostId ?? -1) ?? null,
    members: (room.members ?? [])
      .map((m) => heads.get(relId(m) ?? -1))
      .filter((m): m is MutualHead => Boolean(m)),
    invites: (room.invites ?? [])
      .map((invite) => {
        const user = heads.get(relId(invite.user) ?? -1)
        return user ? { user, invitedBy: heads.get(relId(invite.invitedBy) ?? -1) ?? null } : null
      })
      .filter((i): i is CardInviteData => Boolean(i)),
    game: {
      state: game?.state === 'playing' || game?.state === 'finished' ? game.state : 'lobby',
      round: game?.round ?? 0,
      turnSeat: state.turnSeat,
      drawFromSeat: drawSource,
      players: state.seats.map((userId, seatIndex) => ({
        user: heads.get(userId) ?? { id: userId, name: 'Player', username: '', avatarUrl: null },
        seatIndex,
        cardCount: state.hands[userId]?.length ?? 0,
        // Anyone without cards once the round has dealt is safe (playing) —
        // on finish this leaves only the unggoy holder marked in.
        isOut: game?.state !== 'lobby' && !holding.has(seatIndex),
        isTurn: game?.state === 'playing' && seatIndex === state.turnSeat,
        isDrawSource: drawSource !== null && seatIndex === drawSource,
      })),
      myCards: game?.state === 'playing' && mySeat !== -1 ? (state.hands[forUser.id] ?? []) : null,
      mySeat: game?.state === 'playing' && mySeat !== -1 ? mySeat : null,
      lastDraw: lastDraw?.by
        ? {
            by: heads.get(relId(lastDraw.by) ?? -1) ?? null,
            from: heads.get(relId(lastDraw.from) ?? -1) ?? null,
            paired: Boolean(lastDraw.paired),
          }
        : null,
      loser: heads.get(relId(game?.loser) ?? -1) ?? null,
    },
    serverNow: Date.now(),
  }
}

export async function serializeCardSummary(
  payload: Payload,
  room: CardRoom,
  forUserId?: number | null,
): Promise<CardRoomSummary> {
  const heads = await headMap(payload, [room])
  const hostId = relId(room.host)
  const members = (room.members ?? [])
    .map((m) => heads.get(relId(m) ?? -1))
    .filter((m): m is MutualHead => Boolean(m))
  // When the summary is rendered for an invitee, surface who sent it.
  const myInvite = (room.invites ?? []).find((i) => relId(i.user) === forUserId)
  return {
    id: room.id,
    name: cardDisplayName(room, heads.get(hostId ?? -1)?.name),
    status: room.status === 'ended' ? 'ended' : 'open',
    hostId,
    members,
    memberCount: members.length,
    gameState:
      room.game?.state === 'playing' || room.game?.state === 'finished' ? room.game.state : 'lobby',
    round: room.game?.round ?? 0,
    invitedBy: heads.get(relId(myInvite?.invitedBy) ?? -1) ?? null,
  }
}

// Rooms a user is a party to, for reads and live-event fan-out targets.
export const cardRoomMemberIds = (room: CardRoom): number[] => {
  const ids = new Set<number>()
  for (const ref of room.members ?? []) {
    const id = relId(ref)
    if (id) ids.add(id)
  }
  return [...ids]
}

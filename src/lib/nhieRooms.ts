import type { Payload } from 'payload'

import type { NhieRoom, User } from '@/payload-types'

import type { MutualHead } from './mutuals'
import { activeIds, type NhieAnswer } from './nhie'
import { avatarUrl, relId } from './serialize'

export interface NhiePlayer {
  user: MutualHead
  seatIndex: number
  /** Fingers left — 0 means out of the game. */
  fingers: number
  isOut: boolean
  /** This player's turn to supply the prompt. */
  isTurn: boolean
  /** They already locked in an answer to the current prompt. */
  hasAnswered: boolean
}

export interface NhieGameData {
  state: 'lobby' | 'playing' | 'finished'
  round: number
  turnSeat: number
  /** Derived phase: picking a prompt → answering → reveal. */
  phase: 'prompting' | 'answering' | 'revealed'
  players: NhiePlayer[]
  prompt: { text: string; by: MutualHead | null; source: 'deck' | 'custom' } | null
  /** How many still-in players have locked an answer. */
  answeredCount: number
  /** How many players still hold fingers. */
  activeCount: number
  /**
   * Per-player answers — populated only once the circle resolves, so nobody
   * can bandwagon off answers they haven't earned. Before that, use
   * `hasAnswered` flags for "waiting on" UI.
   */
  answers: { user: MutualHead; answer: NhieAnswer }[] | null
  /** The viewer's own locked answer — visible immediately. */
  myAnswer: NhieAnswer | null
  /** The viewer's seat index — null when they aren't seated this game. */
  mySeat: number | null
  /** The last resolved prompt and who lost a finger on it. */
  lastResult: { text: string; drops: MutualHead[] } | null
  winner: MutualHead | null
}

export interface NhieInviteData {
  user: MutualHead
  invitedBy: MutualHead | null
}

export interface NhieRoomData {
  id: number
  name: string
  status: 'open' | 'ended'
  hostId: number | null
  host: MutualHead | null
  members: MutualHead[]
  invites: NhieInviteData[]
  /** Users who knocked and are waiting on the host — host-only. */
  requests?: MutualHead[]
  game: NhieGameData
  serverNow: number
}

// What a non-member sees when they land on a room link — enough to render
// the "ask to join" gate without leaking room contents.
export interface NhieGateData {
  exists: boolean
  open: boolean
  name: string | null
  hostName: string | null
  /** A knock would be accepted — open room, not a party, mutual of the host. */
  canAsk: boolean
  /** A knock is already pending and unread by the host. */
  asked: boolean
}

export interface NhieRoomSummary {
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
type FingerRow = { user?: number | User | null; count?: number | null }
type ResponseRow = { user?: number | User | null; answer?: string | null }
type PromptRow = { text?: string | null; by?: number | User | null; source?: string | null }

// Fetch every user referenced by a room (host, members, invitees, seats,
// prompt author, lastResult drops, winner) in one query and hand out
// MutualHeads — docs are loaded at depth 0 upstream, so this is the only
// population step.
async function headMap(payload: Payload, rooms: NhieRoom[]): Promise<Map<number, MutualHead>> {
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
    const id = relId((game?.prompt as PromptRow | undefined)?.by)
    if (id) ids.add(id)
    for (const drop of lastResultDrops(room)) ids.add(drop)
    const winner = relId(game?.winner)
    if (winner) ids.add(winner)
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

export const nhieDisplayName = (room: NhieRoom, hostName?: string | null) =>
  (typeof room.name === 'string' && room.name.trim()) ||
  `${hostName ?? 'Someone'}'s Never Have I Ever`

// Read the room's game group into the engine's state shape — seats as user
// ids, fingers and responses keyed by user id.
export const nhieEngineState = (room: NhieRoom) => {
  const game = room.game
  const seats = ((game?.seats ?? []) as SeatRow[])
    .map((s) => relId(s.user))
    .filter((id): id is number => id !== null)
  const fingers: Record<number, number> = {}
  for (const row of (game?.fingers ?? []) as FingerRow[]) {
    const id = relId(row.user)
    if (id !== null) fingers[id] = row.count ?? 0
  }
  const responses: Record<number, NhieAnswer> = {}
  for (const row of (game?.responses ?? []) as ResponseRow[]) {
    const id = relId(row.user)
    if (id !== null && (row.answer === 'have' || row.answer === 'never')) {
      responses[id] = row.answer
    }
  }
  const prompt = game?.prompt as PromptRow | undefined
  const usedPrompts = Array.isArray(game?.usedPrompts)
    ? game.usedPrompts.filter((i): i is number => typeof i === 'number')
    : []
  return {
    seats,
    fingers,
    turnSeat: game?.turnSeat ?? 0,
    prompt:
      typeof prompt?.text === 'string' && prompt.text
        ? {
            text: prompt.text,
            by: relId(prompt.by),
            source: prompt.source === 'custom' ? ('custom' as const) : ('deck' as const),
          }
        : null,
    responses,
    usedPrompts,
  }
}

const lastResultDrops = (room: NhieRoom): number[] => {
  const drops = room.game?.lastResult?.drops
  if (!Array.isArray(drops)) return []
  return drops.filter((d): d is number => typeof d === 'number')
}

// Per-player serialization — answers stay hidden until the circle resolves;
// the `responses` field is admin-read-only at the field level, so this is
// the ONLY way members ever see who answered what.
export async function serializeNhieRoom(
  payload: Payload,
  room: NhieRoom,
  forUser: User,
): Promise<NhieRoomData> {
  const heads = await headMap(payload, [room])
  const hostId = relId(room.host)
  const state = nhieEngineState(room)
  const game = room.game
  const active = new Set(activeIds(state))
  const answeredIds = new Set(Object.keys(state.responses).map(Number))
  const resolved = active.size > 0 && [...active].every((id) => answeredIds.has(id))
  const mySeat = state.seats.indexOf(forUser.id)
  const dropIds = lastResultDrops(room)

  return {
    id: room.id,
    name: nhieDisplayName(room, heads.get(hostId ?? -1)?.name),
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
      .filter((i): i is NhieInviteData => Boolean(i)),
    game: {
      state: game?.state === 'playing' || game?.state === 'finished' ? game.state : 'lobby',
      round: game?.round ?? 0,
      turnSeat: state.turnSeat,
      phase: !state.prompt ? 'prompting' : resolved ? 'revealed' : 'answering',
      players: state.seats.map((userId, seatIndex) => ({
        user: heads.get(userId) ?? { id: userId, name: 'Player', username: '', avatarUrl: null },
        seatIndex,
        fingers: state.fingers[userId] ?? 0,
        isOut: game?.state !== 'lobby' && !active.has(userId),
        isTurn: game?.state === 'playing' && seatIndex === state.turnSeat,
        hasAnswered: answeredIds.has(userId),
      })),
      prompt: state.prompt
        ? {
            text: state.prompt.text,
            by: state.prompt.by !== null ? (heads.get(state.prompt.by) ?? null) : null,
            source: state.prompt.source,
          }
        : null,
      answeredCount: answeredIds.size,
      activeCount: active.size,
      answers: resolved
        ? Object.entries(state.responses).flatMap(([uid, answer]) => {
            const user = heads.get(Number(uid))
            return user ? [{ user, answer }] : []
          })
        : null,
      myAnswer: state.responses[forUser.id] ?? null,
      mySeat: game?.state !== 'lobby' && mySeat !== -1 ? mySeat : null,
      lastResult:
        typeof game?.lastResult?.text === 'string' && game.lastResult.text
          ? {
              text: game.lastResult.text,
              drops: dropIds
                .map((id) => heads.get(id))
                .filter((h): h is MutualHead => Boolean(h)),
            }
          : null,
      winner: heads.get(relId(game?.winner) ?? -1) ?? null,
    },
    serverNow: Date.now(),
  }
}

export async function serializeNhieSummary(
  payload: Payload,
  room: NhieRoom,
  forUserId?: number | null,
): Promise<NhieRoomSummary> {
  const heads = await headMap(payload, [room])
  const hostId = relId(room.host)
  const members = (room.members ?? [])
    .map((m) => heads.get(relId(m) ?? -1))
    .filter((m): m is MutualHead => Boolean(m))
  // When the summary is rendered for an invitee, surface who sent it.
  const myInvite = (room.invites ?? []).find((i) => relId(i.user) === forUserId)
  return {
    id: room.id,
    name: nhieDisplayName(room, heads.get(hostId ?? -1)?.name),
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
export const nhieRoomMemberIds = (room: NhieRoom): number[] => {
  const ids = new Set<number>()
  for (const ref of room.members ?? []) {
    const id = relId(ref)
    if (id) ids.add(id)
  }
  return [...ids]
}

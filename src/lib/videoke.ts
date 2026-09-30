import type { Payload } from 'payload'

import type { User, VideokeQueueItem, VideokeRoom } from '@/payload-types'

import type { MutualHead } from './mutuals'
import { avatarUrl, relId } from './serialize'

export interface QueueItemData {
  id: number
  videoId: string
  title: string
  thumbnail: string | null
  durationSec: number | null
  addedBy: MutualHead | null
  state: 'queued' | 'playing' | 'done' | 'skipped'
  position: number
}

export interface PlaybackData {
  itemId: number | null
  state: 'idle' | 'playing' | 'paused'
  startedAt: string | null
  positionSec: number
}

export interface VideokeInviteData {
  user: MutualHead
  invitedBy: MutualHead | null
}

export interface VideokeRoomData {
  id: number
  name: string
  status: 'open' | 'ended'
  hostId: number | null
  host: MutualHead | null
  members: MutualHead[]
  invites: VideokeInviteData[]
  /** Users who knocked and are waiting on the host — host-only, empty for
      everyone else. */
  requests?: MutualHead[]
  playback: PlaybackData
  queue: QueueItemData[]
  // Server clock at serialization time — the client derives its skew so
  // playback position math doesn't depend on device clocks being right.
  serverNow: number
}

// What a non-member sees when they land on a room link — enough to render
// the "ask to join" gate without leaking room contents.
export interface VideokeGateData {
  exists: boolean
  open: boolean
  name: string | null
  hostName: string | null
  /** A knock would be accepted — open room, not a party, mutual of the host. */
  canAsk: boolean
  /** A knock is already pending and unread by the host. */
  asked: boolean
}

export interface VideokeRoomSummary {
  id: number
  name: string
  status: 'open' | 'ended'
  hostId: number | null
  members: MutualHead[]
  memberCount: number
  nowPlaying: string | null
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

// Fetch every user referenced by a room (host, members, invitees, queue
// adders) in one query and hand out MutualHeads — relationship fields are
// loaded at depth 0 upstream, so this is the only population step.
async function headMap(
  payload: Payload,
  rooms: VideokeRoom[],
  items: VideokeQueueItem[],
): Promise<Map<number, MutualHead>> {
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
  }
  for (const item of items) {
    const id = relId(item.addedBy)
    if (id) ids.add(id)
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

export const roomDisplayName = (room: VideokeRoom, hostName?: string | null) =>
  (typeof room.name === 'string' && room.name.trim()) || `${hostName ?? 'Someone'}'s videoke`

export async function serializeVideokeRoom(
  payload: Payload,
  room: VideokeRoom,
  items: VideokeQueueItem[],
): Promise<VideokeRoomData> {
  const heads = await headMap(payload, [room], items)
  const hostId = relId(room.host)
  const playback = (room.playback ?? {}) as VideokeRoom['playback']

  const state = (s: unknown): QueueItemData['state'] =>
    s === 'playing' || s === 'done' || s === 'skipped' ? s : 'queued'

  return {
    id: room.id,
    name: roomDisplayName(room, heads.get(hostId ?? -1)?.name),
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
      .filter((i): i is VideokeInviteData => Boolean(i)),
    playback: {
      itemId: relId(playback?.item ?? null),
      state:
        playback?.state === 'playing' || playback?.state === 'paused' ? playback.state : 'idle',
      startedAt: typeof playback?.startedAt === 'string' ? playback.startedAt : null,
      positionSec: typeof playback?.positionSec === 'number' ? playback.positionSec : 0,
    },
    queue: items.map((item) => ({
      id: item.id,
      videoId: item.videoId,
      title: item.title,
      thumbnail: item.thumbnail ?? null,
      durationSec: typeof item.durationSec === 'number' ? item.durationSec : null,
      addedBy: heads.get(relId(item.addedBy) ?? -1) ?? null,
      state: state(item.state),
      position: item.position,
    })),
    serverNow: Date.now(),
  }
}

export async function serializeVideokeSummary(
  payload: Payload,
  room: VideokeRoom,
  playingItem: VideokeQueueItem | null,
  forUserId?: number | null,
): Promise<VideokeRoomSummary> {
  const heads = await headMap(payload, [room], [])
  const hostId = relId(room.host)
  const members = (room.members ?? [])
    .map((m) => heads.get(relId(m) ?? -1))
    .filter((m): m is MutualHead => Boolean(m))
  // When the summary is rendered for an invitee, surface who sent it.
  const myInvite = (room.invites ?? []).find((i) => relId(i.user) === forUserId)
  return {
    id: room.id,
    name: roomDisplayName(room, heads.get(hostId ?? -1)?.name),
    status: room.status === 'ended' ? 'ended' : 'open',
    hostId,
    members,
    memberCount: members.length,
    nowPlaying: playingItem?.title ?? null,
    invitedBy: heads.get(relId(myInvite?.invitedBy) ?? -1) ?? null,
  }
}

// Rooms a user is a party to, for reads and live-event fan-out targets.
export const roomMemberIds = (room: VideokeRoom): number[] => {
  const ids = new Set<number>()
  for (const ref of room.members ?? []) {
    const id = relId(ref)
    if (id) ids.add(id)
  }
  return [...ids]
}

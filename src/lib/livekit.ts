import { SignJWT } from 'jose'

import type { User, VideokeQueueItem, VideokeRoom } from '@/payload-types'

import { relId } from './serialize'

// LiveKit voice for videoke rooms. The SFU is self-hosted (deploy/livekit) and
// clients connect straight to it — the app only mints access tokens, which are
// plain HS256 JWTs (LiveKit's documented format) signed with the API secret,
// so no server SDK is needed. A token scopes the member to one
// `videoke-{roomId}` room; `canPublish` is the real mic gate — only the host
// and the current singer may hold the mic.
const TOKEN_TTL_SECONDS = 4 * 60 * 60

export const livekitRoomName = (roomId: number) => `videoke-${roomId}`

// Who may hold the mic right now: the host plus whoever queued the currently
// playing song. One entry when they're the same person, or when the stage is
// idle (host only).
export const micHolderIds = (room: VideokeRoom, items: VideokeQueueItem[]): Set<number> => {
  const allowed = new Set<number>()
  const hostId = relId(room.host)
  if (hostId) allowed.add(hostId)
  const picker = items.find((i) => i.id === relId(room.playback?.item))
  const pickerId = picker ? relId(picker.addedBy) : null
  if (pickerId) allowed.add(pickerId)
  return allowed
}

export const livekitConfigured = () =>
  Boolean(
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET &&
    process.env.NEXT_PUBLIC_LIVEKIT_URL,
  )

export async function mintVoiceToken(
  user: User,
  roomId: number,
  canPublish: boolean,
): Promise<{ token: string; url: string; expiresAt: number }> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL
  if (!apiKey || !apiSecret || !url) throw new Error('LiveKit is not configured.')

  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000
  const token = await new SignJWT({
    sub: String(user.id),
    name: user.name,
    video: {
      roomJoin: true,
      room: livekitRoomName(roomId),
      canPublish,
      canSubscribe: true,
    },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(apiKey)
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime(expiresAt / 1000)
    // See mintChatTicket — Buffer keeps this a node-realm Uint8Array.
    .sign(Buffer.from(apiSecret, 'utf8'))

  return { token, url, expiresAt }
}

// Flip publish rights on already-connected participants — the token grant is
// fixed at join time, so when the song (and therefore the singer) changes the
// SFU must be told directly. Twirp endpoint, Basic auth with key:secret;
// revoking canPublish unpublishes their mic track. Best-effort: a member who
// isn't connected just returns an error we ignore.
export async function updateVoicePublishers(
  roomId: number,
  memberIds: number[],
  publishableIds: ReadonlySet<number>,
): Promise<void> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL
  if (!apiKey || !apiSecret || !wsUrl) return

  const base = wsUrl.replace(/^ws/, 'http')
  const auth = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`
  await Promise.allSettled(
    memberIds.map((id) =>
      fetch(`${base}/twirp/livekit.RoomService/UpdateParticipant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth },
        body: JSON.stringify({
          room: livekitRoomName(roomId),
          identity: String(id),
          permission: {
            canSubscribe: true,
            canPublish: publishableIds.has(id),
            canPublishData: false,
          },
        }),
      }),
    ),
  )
}

import { SignJWT } from 'jose'

import type { User } from '@/payload-types'

// LiveKit voice for videoke rooms. The SFU is self-hosted (deploy/livekit) and
// clients connect straight to it — the app only mints access tokens, which are
// plain HS256 JWTs (LiveKit's documented format) signed with the API secret,
// so no server SDK is needed. A token scopes the member to one
// `videoke-{roomId}` room with publish+subscribe rights.
const TOKEN_TTL_SECONDS = 4 * 60 * 60

export const livekitRoomName = (roomId: number) => `videoke-${roomId}`

export const livekitConfigured = () =>
  Boolean(
    process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET &&
      process.env.NEXT_PUBLIC_LIVEKIT_URL,
  )

export async function mintVoiceToken(
  user: User,
  roomId: number,
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
      canPublish: true,
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

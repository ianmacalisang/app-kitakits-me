import { SignJWT } from 'jose'
import type { Payload } from 'payload'

import type { User } from '@/payload-types'

import { avatarUrl } from './serialize'

const TICKET_TTL_SECONDS = 10 * 60
const MUTUALS_CAP = 500

// Ids of users `userId` follows AND who follow `userId` back — the only set the
// ephemeral chat service may connect. Two indexed `follows` queries + a set
// intersection; runs once per ticket mint (never per message). Both lists load
// uncapped — truncating either side before intersecting can silently drop a
// real mutual (asymmetric lists make invites fail while presence shows them
// online); the cap applies to the result, which the ticket caps anyway.
export async function getMutualFollowIds(payload: Payload, userId: number): Promise<number[]> {
  const [following, followers] = await Promise.all([
    payload.find({
      collection: 'follows',
      where: { follower: { equals: userId } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'follows',
      where: { following: { equals: userId } },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const followingIds = new Set(
    following.docs.map((f) => (typeof f.following === 'object' ? f.following.id : f.following)),
  )
  return followers.docs
    .map((f) => (typeof f.follower === 'object' ? f.follower.id : f.follower))
    .filter((id): id is number => typeof id === 'number' && followingIds.has(id))
    .slice(0, MUTUALS_CAP)
}

// HS256 JWT the standalone chat service verifies — carries identity + mutuals
// so the WS layer needs no database. Short TTL limits how stale a mutual list
// (or a leaked ticket) can be.
export async function mintChatTicket(
  user: User,
  mutuals: number[],
): Promise<{ ticket: string; expiresAt: number }> {
  const secret = process.env.CHAT_TICKET_SECRET || process.env.PAYLOAD_SECRET || ''
  const expiresAt = Date.now() + TICKET_TTL_SECONDS * 1000

  const ticket = await new SignJWT({
    uid: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: avatarUrl(user) ?? null,
    mutuals,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(expiresAt / 1000)
    // Buffer keeps this a node-realm Uint8Array — vitest's jsdom realm makes
    // TextEncoder bytes that jose's instanceof check rejects.
    .sign(Buffer.from(secret, 'utf8'))

  return { ticket, expiresAt }
}

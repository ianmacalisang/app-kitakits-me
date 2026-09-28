import { createHmac, timingSafeEqual } from 'crypto'

import type { Payload } from 'payload'

import type { User } from '@/payload-types'

import { getRequestOrigin } from './auth'
import { checkRate } from './rate-limit'
import { escapeHtml } from './email'
import { USERNAME_PATTERN } from './connect-path'
import { relId } from './serialize'

// ── Connect tokens ──────────────────────────────────────────────────────────
// Stateless signed links emailed to the scanner's account — clicking one proves
// ownership without a password login. Format: base64url("scannerId.ownerId.exp")
// + "." + HMAC-SHA256 signature. Replay within the TTL is a no-op because the
// mutual connect is idempotent, so no token storage or single-use table needed.

const TOKEN_TTL_MS = 30 * 60 * 1000

const tokenSecret = () => process.env.PAYLOAD_SECRET || ''

export interface ConnectTokenPayload {
  scannerId: number
  ownerId: number
  exp: number
}

export const createConnectToken = (scannerId: number, ownerId: number): string => {
  const body = `${scannerId}.${ownerId}.${Date.now() + TOKEN_TTL_MS}`
  const sig = createHmac('sha256', tokenSecret()).update(body).digest('base64url')
  return `${Buffer.from(body).toString('base64url')}.${sig}`
}

// Signature-verified decode. Returns the payload even when expired — callers
// that need expiry enforced should use verifyConnectToken; the confirm page
// uses this to offer a "request a new link" recovery for expired tokens.
export const readConnectToken = (token: string): ConnectTokenPayload | null => {
  const [b64, sig] = token.split('.')
  if (!b64 || !sig) return null

  let body: string
  try {
    body = Buffer.from(b64, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const expected = createHmac('sha256', tokenSecret()).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  const [scannerId, ownerId, exp] = body.split('.').map(Number)
  if (!Number.isInteger(scannerId) || !Number.isInteger(ownerId) || !Number.isFinite(exp)) {
    return null
  }
  return { scannerId, ownerId, exp }
}

export const verifyConnectToken = (
  token: string,
): { scannerId: number; ownerId: number } | null => {
  const payload = readConnectToken(token)
  if (!payload || payload.exp < Date.now()) return null
  return { scannerId: payload.scannerId, ownerId: payload.ownerId }
}

// ── User lookups ────────────────────────────────────────────────────────────
// Anonymous visitors can't read the users collection, so these run with access
// overridden — results stay server-side and are never serialized to the client
// beyond name/username/avatar.

export const findUserByUsername = async (
  payload: Payload,
  username: string,
): Promise<User | null> => {
  if (!USERNAME_PATTERN.test(username)) return null
  const result = await payload.find({
    collection: 'users',
    where: { username: { equals: username } },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
}

// Identifier is an email or @username. Email is matched on both the raw and
// lowercased input since registration stores it as typed.
export const findUserByIdentifier = async (
  payload: Payload,
  identifier: string,
): Promise<User | null> => {
  const raw = identifier.trim().replace(/^@/, '')
  if (!raw) return null
  const lower = raw.toLowerCase()
  const result = await payload.find({
    collection: 'users',
    where: {
      or: [
        { username: { equals: raw } },
        { username: { equals: lower } },
        { email: { equals: raw } },
        { email: { equals: lower } },
      ],
    },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
}

// ── Mutual connect ──────────────────────────────────────────────────────────

// Creates whichever follow edges are missing between a and b, then emails both
// accounts — but only when a new connection actually formed, so revisiting a
// link never re-sends. Edge creation runs without `user` (access overridden):
// passing one would make the Follows beforeValidate hook overwrite `follower`
// with that user, breaking the reverse edge.
export const mutualConnect = async (
  payload: Payload,
  a: User,
  b: User,
): Promise<{ connected: boolean }> => {
  if (a.id === b.id) return { connected: false }

  // Bounded per initiator — a widely shared link can't hammer the DB.
  const allowed = checkRate(`connect:${a.id}`, 20, 60_000)

  const existing = await payload.find({
    collection: 'follows',
    where: {
      or: [
        { and: [{ follower: { equals: a.id } }, { following: { equals: b.id } }] },
        { and: [{ follower: { equals: b.id } }, { following: { equals: a.id } }] },
      ],
    },
    limit: 2,
    depth: 0,
  })
  const edges = new Set(existing.docs.map((f) => `${relId(f.follower)}:${relId(f.following)}`))

  let created = 0
  if (allowed)
    for (const [follower, following] of [
      [a.id, b.id],
      [b.id, a.id],
    ]) {
      const key = `${follower}:${following}`
      if (edges.has(key)) continue
      try {
        await payload.create({
          collection: 'follows',
          data: { follower, following },
        })
        created++
      } catch {
        // A racing request already created this edge — treat as connected.
      }
      edges.add(key)
    }

  if (created > 0) await sendConnectionEmails(payload, a, b)
  return { connected: edges.size >= 2 }
}

// ── Emails ──────────────────────────────────────────────────────────────────

const emailBaseUrl = async (payload: Payload): Promise<string> =>
  (await getRequestOrigin()) || payload.config.serverURL || ''

const mailCard = (title: string, body: string, cta?: { href: string; label: string }) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#262626">
    <h2 style="margin:0 0 16px;font-size:20px">${title}</h2>
    <p style="margin:0 0 16px;line-height:1.5">${body}</p>
    ${
      cta
        ? `<p style="margin:0 0 16px">
            <a href="${cta.href}" style="display:inline-block;background:#047857;color:#ffffff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600">
              ${cta.label}
            </a>
          </p>`
        : ''
    }
  </div>
`

// "You're connected" email — one to each party, personalized to the recipient.
export const sendConnectionEmails = async (payload: Payload, a: User, b: User): Promise<void> => {
  const brand = escapeHtml(payload.email?.defaultFromName || 'Kitakits')
  const baseURL = await emailBaseUrl(payload)

  const send = async (to: User, other: User) => {
    if (typeof to.email !== 'string' || !to.email) return
    const name = escapeHtml(to.name)
    const otherName = escapeHtml(other.name)
    const otherUsername = escapeHtml(other.username)
    try {
      await payload.sendEmail({
        to: to.email,
        subject: `You connected with ${otherName} on ${brand}`,
        html: mailCard(
          `You're connected, ${name}!`,
          `You and <strong>${otherName} (@${otherUsername})</strong> now follow each other on
           ${brand} — you'll see each other's posts in your feeds.`,
          baseURL
            ? { href: `${baseURL}/profile/${otherUsername}`, label: `View @${otherUsername}` }
            : undefined,
        ),
      })
    } catch (err) {
      // Email delivery must never fail a connection.
      payload.logger.error({ err, msg: 'Failed to send connection email', userId: to.id })
    }
  }

  await Promise.all([send(a, b), send(b, a)])
}

// The "finish connecting" magic link for logged-out scanners who identified
// their account by email/username.
export const sendConnectLinkEmail = async (
  payload: Payload,
  scanner: User,
  owner: User,
  url: string,
): Promise<void> => {
  const brand = escapeHtml(payload.email?.defaultFromName || 'Kitakits')
  const name = escapeHtml(scanner.name)
  const ownerName = escapeHtml(owner.name)
  const ownerUsername = escapeHtml(owner.username)

  try {
    await payload.sendEmail({
      to: scanner.email,
      subject: `Finish connecting with @${ownerUsername} on ${brand}`,
      html: mailCard(
        `Almost there, ${name}`,
        `Tap below to connect with <strong>${ownerName} (@${ownerUsername})</strong> —
         you'll follow each other instantly. This link expires in 30 minutes.
         If you didn't scan their code, you can ignore this email.`,
        { href: url, label: `Connect with ${ownerName}` },
      ),
    })
  } catch (err) {
    payload.logger.error({ err, msg: 'Failed to send connect link', userId: scanner.id })
  }
}

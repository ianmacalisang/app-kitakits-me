'use server'

import { getRequestOrigin } from '@/lib/auth'
import {
  createConnectToken,
  findUserByIdentifier,
  findUserByUsername,
  mutualConnect,
  sendConnectLinkEmail,
  verifyConnectToken,
} from '@/lib/connect'
import { USERNAME_PATTERN } from '@/lib/connect-path'
import { getPayloadClient } from '@/lib/payload'
import { checkRate, rateLimitIP } from '@/lib/rate-limit'

export interface ConnectLinkState {
  error?: string
  sent?: boolean
}

// Logged-out scanner identifies their account by email/username — we email a
// signed one-time connect link to that account's registered address. The
// response is uniform whether or not the identifier matched, so the endpoint
// can't be used to enumerate accounts.
export async function requestConnectLink(
  _prev: ConnectLinkState,
  formData: FormData,
): Promise<ConnectLinkState> {
  const ownerUsername = String(formData.get('owner') ?? '').trim()
  const identifier = String(formData.get('identifier') ?? '').trim()

  if (!USERNAME_PATTERN.test(ownerUsername)) return { error: 'That link is invalid.' }
  if (!identifier) return { error: 'Enter your email or username.' }

  const ipOk = await rateLimitIP('connect-req', 5, 60_000)
  const identOk = checkRate(`connect-req:${identifier.toLowerCase()}`, 3, 15 * 60_000)
  // Report success on limit the same way as a match — the email simply never
  // goes out, and a rate-limited attacker learns nothing.
  if (!ipOk || !identOk) return { sent: true }

  const payload = await getPayloadClient()
  const [owner, scanner] = await Promise.all([
    findUserByUsername(payload, ownerUsername),
    findUserByIdentifier(payload, identifier),
  ])

  if (owner && scanner && scanner.id !== owner.id) {
    const origin = await getRequestOrigin()
    const url = `${origin}/connect/confirm?token=${createConnectToken(scanner.id, owner.id)}`
    await sendConnectLinkEmail(payload, scanner, owner, url)
  }

  return { sent: true }
}

export interface ConfirmState {
  error?: string
  success?: boolean
  ownerUsername?: string
}

// The emailed link's confirm tap — the token is re-verified server-side before
// any edges are created.
export async function confirmConnect(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const ids = verifyConnectToken(String(formData.get('token') ?? ''))
  if (!ids) {
    return { error: 'That link is invalid or has expired. Ask for a new one.' }
  }

  const payload = await getPayloadClient()
  const [scanner, owner] = await Promise.all([
    payload.findByID({ collection: 'users', id: ids.scannerId, depth: 1 }),
    payload.findByID({ collection: 'users', id: ids.ownerId, depth: 1 }),
  ])
  if (!scanner || !owner) {
    return { error: 'One of these accounts no longer exists.' }
  }

  await mutualConnect(payload, scanner, owner)
  return { success: true, ownerUsername: owner.username }
}

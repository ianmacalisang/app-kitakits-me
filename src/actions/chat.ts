'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getMutualFollowIds, mintChatTicket } from '@/lib/chat'
import { getMutuals, type MutualsPage } from '@/lib/mutuals'
import { getPayloadClient } from '@/lib/payload'

export interface ChatTicket {
  ticket: string
  expiresAt: number
}

// Mutual-follow roster for the chat dropdown — fetched lazily when the menu
// opens so other pages don't pay for a roster they never show. Paged; callers
// load subsequent pages with a "show more" / sentinel control.
export async function getChatMutuals(page = 1, limit?: number): Promise<MutualsPage> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return getMutuals(user, page, limit)
}

// Mint a short-lived credential for the standalone chat WebSocket service.
// The ticket carries the user's identity + their mutual-follow ids, so the
// chat service can gate invites without ever touching the database — this
// is the only DB read in the entire chat path.
export async function getChatTicket(): Promise<ChatTicket> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const [mutuals, fullUser] = await Promise.all([
    getMutualFollowIds(payload, user.id),
    payload.findByID({ collection: 'users', id: user.id, depth: 1 }),
  ])

  return mintChatTicket(fullUser, mutuals)
}

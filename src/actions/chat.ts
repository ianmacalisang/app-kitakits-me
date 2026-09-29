'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getMutualFollowIds, mintChatTicket } from '@/lib/chat'
import { getMutuals, type MutualHead } from '@/lib/mutuals'
import { getPayloadClient } from '@/lib/payload'

export interface ChatTicket {
  ticket: string
  expiresAt: number
}

// Mutual-follow roster for the chat dropdown — fetched lazily when the menu
// opens so other pages don't pay for a roster they never show.
export async function getChatMutuals(): Promise<MutualHead[]> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return getMutuals(user)
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

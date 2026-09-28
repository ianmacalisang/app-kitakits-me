'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getMutualFollowIds, mintChatTicket } from '@/lib/chat'
import { getPayloadClient } from '@/lib/payload'

export interface ChatTicket {
  ticket: string
  expiresAt: number
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

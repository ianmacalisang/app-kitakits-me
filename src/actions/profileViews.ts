'use server'

import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { recordProfileView as recordView } from '@/lib/profileViews'

// Fired by ProfileViewBeacon on profile mounts. The opt-in flag is re-checked
// server-side — the beacon is only rendered for opted-in viewers, but a
// client can't be trusted to make that call.
export async function recordProfileView(viewedUserId: number): Promise<void> {
  const user = await getCurrentUser()
  if (!user || !Number.isInteger(viewedUserId) || viewedUserId <= 0) return

  const payload = await getPayloadClient()
  try {
    await recordView(payload, user, viewedUserId)
  } catch {
    // Best-effort — a failed write should never break profile rendering.
  }
}

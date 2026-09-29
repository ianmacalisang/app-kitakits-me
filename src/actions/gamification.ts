'use server'

import { getCurrentUser } from '@/lib/auth'
import { getBadgeProgressForUser } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import type { BadgeProgressData } from '@/lib/serialize'

// All badges a user has earned — powers the achievements sheet opened from
// badge-earned activity rows.
export async function getUserBadges(username: string): Promise<BadgeProgressData[]> {
  const viewer = await getCurrentUser()
  if (!viewer) return []

  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'users',
    where: { username: { equals: username } },
    limit: 1,
    depth: 0,
    user: viewer,
    overrideAccess: false,
  })
  const target = res.docs[0]
  if (!target) return []

  return getBadgeProgressForUser(payload, target.id)
}

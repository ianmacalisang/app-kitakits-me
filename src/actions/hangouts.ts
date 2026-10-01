'use server'

import type { Where } from 'payload'

import { getCurrentUser } from '@/lib/auth'
import { getMutualFollowIds } from '@/lib/chat'
import type { HangoutKind } from '@/lib/hangouts'
import type { MutualHead } from '@/lib/mutuals'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl, relId } from '@/lib/serialize'

export interface HangoutPresenceEntry {
  /** First 3 mutuals inside — enough for the card's avatar stack. */
  heads: MutualHead[]
  /** Total mutuals in open rooms of this kind (heads + the +X overflow). */
  total: number
}

export type HangoutPresence = Record<HangoutKind, HangoutPresenceEntry>

const EMPTY: HangoutPresence = {
  videoke: { heads: [], total: 0 },
  cards: { heads: [], total: 0 },
  nhie: { heads: [], total: 0 },
}

// Mutuals currently inside open rooms, per app — the avatar row under each
// Tambayan card. Members only: invitees and knockers haven't joined yet.
export async function getHangoutPresence(): Promise<HangoutPresence> {
  const user = await getCurrentUser()
  if (!user) return EMPTY
  const payload = await getPayloadClient()
  const mutualIds = await getMutualFollowIds(payload, user.id)
  if (mutualIds.length === 0) return EMPTY

  const mutualSet = new Set(mutualIds)
  const where: Where = {
    and: [{ members: { in: mutualIds } }, { status: { equals: 'open' } }],
  }
  const read = { where, limit: 100, depth: 0, overrideAccess: true } as const
  const [videoke, cards, nhie] = await Promise.all([
    payload.find({ collection: 'videoke-rooms', ...read }),
    payload.find({ collection: 'card-rooms', ...read }),
    payload.find({ collection: 'nhie-rooms', ...read }),
  ])

  // Ordered dedupe — one entry per mutual even if they're in several rooms.
  const byKind = new Map<HangoutKind, number[]>()
  const collect = (kind: HangoutKind, docs: { members?: unknown }[]) => {
    const seen = byKind.get(kind) ?? []
    const inSeen = new Set(seen)
    for (const doc of docs) {
      const members = Array.isArray(doc.members) ? doc.members : []
      for (const ref of members) {
        const id = relId(ref)
        if (id !== null && mutualSet.has(id) && !inSeen.has(id)) {
          inSeen.add(id)
          seen.push(id)
        }
      }
    }
    byKind.set(kind, seen)
  }
  collect('videoke', videoke.docs)
  collect('cards', cards.docs)
  collect('nhie', nhie.docs)

  const allIds = [...new Set([...byKind.values()].flat())]
  if (allIds.length === 0) return EMPTY

  const { docs: users } = await payload.find({
    collection: 'users',
    where: { id: { in: allIds } },
    limit: allIds.length,
    depth: 1,
    overrideAccess: true,
  })
  const heads = new Map<number, MutualHead>()
  for (const doc of users) {
    heads.set(doc.id, {
      id: doc.id,
      name: doc.name,
      username: doc.username,
      avatarUrl: avatarUrl(doc) ?? null,
    })
  }

  const entry = (kind: HangoutKind): HangoutPresenceEntry => {
    const ids = byKind.get(kind) ?? []
    return {
      heads: ids
        .slice(0, 3)
        .map((id) => heads.get(id))
        .filter((h): h is MutualHead => Boolean(h)),
      total: ids.length,
    }
  }
  return { videoke: entry('videoke'), cards: entry('cards'), nhie: entry('nhie') }
}

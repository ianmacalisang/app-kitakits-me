import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { pushLive } from '../lib/live'

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'object' && value !== null) {
    const id = Number((value as { id: number | string }).id)
    return Number.isFinite(id) ? id : null
  }
  return null
}

const refreshBoth = (follower: unknown, following: unknown) => {
  const a = idOf(follower)
  const b = idOf(following)
  if (a && b) pushLive([a, b], { type: 'mutuals:refresh' })
}

// A socket's mutuals set is frozen inside the ticket it authed with — the
// chat server never re-reads the DB. When a follow edge changes, ping both
// users so their ChatProvider reconnects and re-auths with a fresh mutuals
// claim; otherwise a brand-new mutual sees the peer "online" while invites
// bounce off the peer's stale snapshot.
export const pushMutualsRefreshChange: CollectionAfterChangeHook = ({ doc, operation }) => {
  if (operation !== 'create') return
  refreshBoth(doc.follower, doc.following)
}

export const pushMutualsRefreshDelete: CollectionAfterDeleteHook = ({ doc }) => {
  if (doc) refreshBoth(doc.follower, doc.following)
}

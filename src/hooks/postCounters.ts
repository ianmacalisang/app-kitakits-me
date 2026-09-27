import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { bumpPostCounter, type PostCounter } from '../lib/counters'

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'object' && value !== null) {
    return Number((value as { id: number | string }).id)
  }
  return null
}

// Maintains a denormalized counter on the referenced post: +1 on create,
// −1 on delete. `field` is the doc's relationship pointing at the post.
// Cascade deletes (e.g. a post deleting its own likes) bump a doomed row —
// harmless, and cheaper than tracking which deletes are cascades.
const counterHooks = (field: string, counter: PostCounter) => {
  const onCreate: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
    if (operation !== 'create') return
    const postId = idOf(doc[field])
    if (postId) await bumpPostCounter(req.payload, postId, counter, 1)
  }
  const onDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
    const postId = idOf(doc?.[field])
    if (postId) await bumpPostCounter(req.payload, postId, counter, -1)
  }
  return { onCreate, onDelete }
}

export const likeCounter = counterHooks('post', 'like')
export const commentCounter = counterHooks('post', 'comment')
export const saveCounter = counterHooks('post', 'save')

// A share is a post whose sharedPost points at the original — bump the
// TARGET's shareCount, not the share row's.
export const shareCounterCreate: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
}) => {
  if (operation !== 'create') return
  const targetId = idOf(doc.sharedPost)
  if (targetId) await bumpPostCounter(req.payload, targetId, 'share', 1)
}

export const shareCounterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const targetId = idOf(doc?.sharedPost)
  if (targetId) await bumpPostCounter(req.payload, targetId, 'share', -1)
}

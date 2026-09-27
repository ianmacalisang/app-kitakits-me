import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { drizzleOf } from './db'

// Denormalized engagement counters on posts — bumped atomically in SQL by
// collection hooks and read straight off the post row at hydration time, so
// a feed page never scans like/comment/save rows just to count them.

const COLUMNS = {
  like: 'like_count',
  comment: 'comment_count',
  share: 'share_count',
  save: 'save_count',
} as const

export type PostCounter = keyof typeof COLUMNS

// Single-statement atomic increment/decrement — concurrent mutations can't
// lose updates. Runs on the pool rather than the caller's transaction: if the
// surrounding write rolls back the counter can drift by one (display-only,
// self-healing via recount), and GREATEST guards underflow either way.
export const bumpPostCounter = async (
  payload: Payload,
  postId: number,
  counter: PostCounter,
  delta: 1 | -1,
): Promise<void> => {
  const db = drizzleOf(payload)
  if (!db || !Number.isFinite(postId) || postId <= 0) return
  await db
    .execute(
      sql.raw(
        `UPDATE posts SET ${COLUMNS[counter]} = GREATEST(0, ${COLUMNS[counter]} + ${delta}) WHERE id = ${Math.trunc(postId)}`,
      ),
    )
    .catch(() => {})
}

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { User } from '@/payload-types'

import { drizzleOf } from './db'
import { relId } from './serialize'

export interface FollowGraph {
  /** IDs of everyone the viewer follows — newest follows first, capped. */
  authorIds: number[]
  /** IDs of everyone following the viewer. */
  followerIds: number[]
}

// Same 2000-edge cap the follow finds used — more than enough for any
// realistic social graph; beyond it the newest 2000 edges still apply.
export const FOLLOW_GRAPH_LIMIT = 2000

// Both directions of the viewer's follow graph in one indexed scan —
// authorIds feed the home feed + activities queries, followerIds feed the
// mutual checks. Raw SQL replaces two ≤2000-row finds and skips Payload's
// per-doc pipeline; only IDs leave the DB, and follows are readable by any
// member anyway.
export async function getFollowGraph(payload: Payload, user: User): Promise<FollowGraph> {
  const db = drizzleOf(payload)
  if (db) {
    const result = (await db.execute(sql`
      SELECT follower_id AS fid, following_id AS tid
      FROM follows
      WHERE follower_id = ${user.id} OR following_id = ${user.id}
      ORDER BY created_at DESC
    `)) as { rows: { fid: number; tid: number }[] }
    const authorIds: number[] = []
    const followerIds: number[] = []
    for (const row of result.rows) {
      if (row.fid === user.id) {
        if (authorIds.length < FOLLOW_GRAPH_LIMIT) authorIds.push(row.tid)
      } else {
        if (followerIds.length < FOLLOW_GRAPH_LIMIT) followerIds.push(row.fid)
      }
    }
    return { authorIds, followerIds }
  }

  // Non-Postgres fallback — the two finds this query replaces.
  const [following, followers] = await Promise.all([
    payload.find({
      collection: 'follows',
      where: { follower: { equals: user.id } },
      sort: '-createdAt',
      limit: FOLLOW_GRAPH_LIMIT,
      depth: 0,
      pagination: false,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'follows',
      where: { following: { equals: user.id } },
      sort: '-createdAt',
      limit: FOLLOW_GRAPH_LIMIT,
      depth: 0,
      pagination: false,
      user,
      overrideAccess: false,
    }),
  ])
  return {
    authorIds: following.docs
      .map((f) => relId(f.following))
      .filter((id): id is number => id !== null),
    followerIds: followers.docs
      .map((f) => relId(f.follower))
      .filter((id): id is number => id !== null),
  }
}

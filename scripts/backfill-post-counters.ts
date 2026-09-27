// One-off backfill for the denormalized engagement counters on posts.
// Run once after deploying the counter columns (schema push or migration):
//   pnpm tsx scripts/backfill-post-counters.ts
// Safe to re-run — it recomputes exact counts rather than incrementing.
import 'dotenv/config'

import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import configPromise from '../src/payload.config'

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const db = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } })
    .drizzle

  await db.execute(sql`
    UPDATE posts p SET like_count = c.n
    FROM (SELECT post_id, COUNT(*)::int AS n FROM likes GROUP BY post_id) c
    WHERE p.id = c.post_id
  `)
  await db.execute(sql`
    UPDATE posts p SET comment_count = c.n
    FROM (SELECT post_id, COUNT(*)::int AS n FROM comments GROUP BY post_id) c
    WHERE p.id = c.post_id
  `)
  await db.execute(sql`
    UPDATE posts p SET save_count = c.n
    FROM (SELECT post_id, COUNT(*)::int AS n FROM saves GROUP BY post_id) c
    WHERE p.id = c.post_id
  `)
  await db.execute(sql`
    UPDATE posts p SET share_count = c.n
    FROM (
      SELECT shared_post_id, COUNT(*)::int AS n
      FROM posts WHERE shared_post_id IS NOT NULL GROUP BY shared_post_id
    ) c
    WHERE p.id = c.shared_post_id
  `)

  payload.logger.info('Post engagement counters backfilled.')
  process.exit(0)
}

void main()

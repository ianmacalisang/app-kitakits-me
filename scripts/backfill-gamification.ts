// Gamification backfill — run once after deploying the badges/points schema:
//   pnpm tsx scripts/backfill-gamification.ts
// Safe to re-run: ledger inserts are keyed with ON CONFLICT DO NOTHING,
// balances are recomputed (not incremented), and badge grants are
// notification-suppressed so existing users aren't spammed.
import 'dotenv/config'

import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import configPromise from '../src/payload.config'
import { evaluateBadges } from '../src/lib/gamification'

import { DEFAULT_BADGES } from './default-badges'

// Ledger rebuild — one INSERT per event kind, keyed so re-runs no-op.
// `key` mirrors the dedupe keys the live hooks write.
const LEDGER_INSERTS = [
  sql`
    INSERT INTO point_events (user_id, kind, points, post_id, "key", created_at, updated_at)
    SELECT p.author_id, 'post', 10, p.id, 'post:' || p.id, p.created_at, p.created_at
    FROM posts p
    ON CONFLICT ("key") DO NOTHING
  `,
  sql`
    INSERT INTO point_events (user_id, kind, points, post_id, "key", created_at, updated_at)
    SELECT c.author_id, 'comment', 5, c.post_id, 'comment:' || c.id, c.created_at, c.created_at
    FROM comments c
    ON CONFLICT ("key") DO NOTHING
  `,
  sql`
    INSERT INTO point_events (user_id, kind, points, post_id, "key", created_at, updated_at)
    SELECT p.author_id, 'comment-received', 3, c.post_id, 'comment-received:' || c.id,
           c.created_at, c.created_at
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE p.author_id <> c.author_id
    ON CONFLICT ("key") DO NOTHING
  `,
  sql`
    INSERT INTO point_events (user_id, kind, points, post_id, "key", created_at, updated_at)
    SELECT p.author_id, 'like-received', 2, l.post_id,
           'like:' || l.post_id || ':' || l.user_id, l.created_at, l.created_at
    FROM likes l JOIN posts p ON p.id = l.post_id
    WHERE p.author_id <> l.user_id
    ON CONFLICT ("key") DO NOTHING
  `,
  sql`
    INSERT INTO point_events (user_id, kind, points, post_id, "key", created_at, updated_at)
    SELECT p.author_id, 'save-received', 2, s.post_id,
           'save:' || s.post_id || ':' || s.user_id, s.created_at, s.created_at
    FROM saves s JOIN posts p ON p.id = s.post_id
    WHERE p.author_id <> s.user_id
    ON CONFLICT ("key") DO NOTHING
  `,
  sql`
    INSERT INTO point_events (user_id, kind, points, post_id, "key", created_at, updated_at)
    SELECT sp.author_id, 'share-received', 4, p.shared_post_id,
           'share:' || p.shared_post_id || ':' || p.author_id, p.created_at, p.created_at
    FROM posts p JOIN posts sp ON sp.id = p.shared_post_id
    WHERE p.shared_post_id IS NOT NULL AND sp.author_id <> p.author_id
    ON CONFLICT ("key") DO NOTHING
  `,
  sql`
    INSERT INTO point_events (user_id, kind, points, "key", created_at, updated_at)
    SELECT f.following_id, 'follow-received', 5,
           'follow:' || f.follower_id || ':' || f.following_id, f.created_at, f.created_at
    FROM follows f
    ON CONFLICT ("key") DO NOTHING
  `,
  sql`
    INSERT INTO point_events (user_id, kind, points, "key", created_at, updated_at)
    SELECT t.recipient_id, 'testimonial-received', 10,
           'testimonial:' || t.id, t.created_at, t.created_at
    FROM testimonials t WHERE t.status = 'approved'
    ON CONFLICT ("key") DO NOTHING
  `,
  sql`
    INSERT INTO point_events (user_id, kind, points, "key", created_at, updated_at)
    SELECT t.author_id, 'testimonial-given', 5,
           'testimonial-given:' || t.id, t.created_at, t.created_at
    FROM testimonials t WHERE t.status = 'approved'
    ON CONFLICT ("key") DO NOTHING
  `,
]

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const db = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } })
    .drizzle

  // 1. Seed default badge definitions (create missing only).
  let created = 0
  for (const badge of DEFAULT_BADGES) {
    const existing = await payload.find({
      collection: 'badges',
      where: { slug: { equals: badge.slug } },
      limit: 1,
      depth: 0,
    })
    if (existing.totalDocs === 0) {
      await payload.create({ collection: 'badges', data: { ...badge } })
      created++
    }
  }
  payload.logger.info(`Badge definitions seeded (${created} created).`)

  // 2. Rebuild the points ledger from existing engagement.
  for (const statement of LEDGER_INSERTS) {
    await db.execute(statement)
  }
  payload.logger.info('Point events ledger rebuilt.')

  // 3. Recompute denormalized balances from the ledger.
  await db.execute(sql`
    UPDATE users u SET points = c.n
    FROM (SELECT user_id, SUM(points)::int AS n FROM point_events GROUP BY user_id) c
    WHERE u.id = c.user_id
  `)
  payload.logger.info('User point balances recomputed.')

  // 4. Evaluate badges for every user — context suppresses the award
  // notifications a live grant would send.
  let page = 1
  for (;;) {
    const users = await payload.find({
      collection: 'users',
      limit: 200,
      page,
      depth: 0,
    })
    for (const user of users.docs) {
      await evaluateBadges({ payload, context: { skipNotification: true } }, user.id)
    }
    if (!users.hasNextPage) break
    page++
  }
  payload.logger.info('Badges evaluated for all users.')

  process.exit(0)
}

void main()

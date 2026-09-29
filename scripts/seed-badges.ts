// Badge-definition seeder — creates the default badges that don't exist yet:
//   pnpm tsx scripts/seed-badges.ts
// Safe to re-run: skips any badge whose slug already exists, so
// admin-customized definitions are never overwritten. For the full
// points/badges backfill (ledger + balances + awards), run
// scripts/backfill-gamification.ts instead.
import 'dotenv/config'

import { getPayload } from 'payload'

import configPromise from '../src/payload.config'

import { DEFAULT_BADGES } from './default-badges'

const main = async () => {
  const payload = await getPayload({ config: configPromise })

  let created = 0
  const skipped: string[] = []
  for (const badge of DEFAULT_BADGES) {
    const existing = await payload.find({
      collection: 'badges',
      where: { slug: { equals: badge.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.totalDocs === 0) {
      await payload.create({ collection: 'badges', data: { ...badge }, overrideAccess: true })
      created++
    } else {
      skipped.push(badge.slug)
    }
  }

  payload.logger.info(
    `Badges seeded: ${created} created, ${skipped.length} already existed${
      skipped.length ? ` (${skipped.join(', ')})` : ''
    }.`,
  )
  process.exit(0)
}

void main()

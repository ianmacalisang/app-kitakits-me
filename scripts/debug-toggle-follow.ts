// Temporary debug: replay toggleFollow's exact write path with a NON-ADMIN
// user (overrideAccess: false + user) to surface whatever error the button's
// silent catch swallows. Creates a follow, then deletes it again.
import 'dotenv/config'

import { getPayload } from 'payload'

import configPromise from '../src/payload.config'

const main = async () => {
  const payload = await getPayload({ config: configPromise })

  const users = await payload.find({
    collection: 'users',
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  const nonAdmin = users.docs.find((u) => u.role !== 'admin')
  const target = users.docs.find((u) => u.id !== nonAdmin?.id)
  if (!nonAdmin || !target) {
    payload.logger.error('Need at least two users (one non-admin) to test')
    process.exit(1)
  }
  payload.logger.info(
    `Testing follow create as non-admin ${nonAdmin.username} -> ${target.username}`,
  )

  // Mirror toggleFollow: check existing, then create — same access context.
  const existing = await payload.find({
    collection: 'follows',
    where: {
      and: [{ follower: { equals: nonAdmin.id } }, { following: { equals: target.id } }],
    },
    limit: 1,
    depth: 0,
    user: nonAdmin,
    overrideAccess: false,
  })
  payload.logger.info(`existing follow docs: ${existing.docs.length}`)

  const args = {
    collection: 'follows' as const,
    data: { follower: nonAdmin.id, following: target.id },
    user: nonAdmin,
    overrideAccess: false,
  }

  try {
    // Round 1: fresh follow (awards points, fresh dedupe key)
    const first = await payload.create(args)
    payload.logger.info(`follow #1 create OK (id ${first.id})`)
    await payload.delete({
      collection: 'follows',
      id: first.id,
      user: nonAdmin,
      overrideAccess: false,
    })
    payload.logger.info('unfollow OK')

    // Round 2: RE-follow — the point-events dedupe key already exists now,
    // so this is the exact case that was aborting the shared transaction.
    const second = await payload.create(args)
    payload.logger.info(`follow #2 (re-follow) create OK (id ${second.id}) — bug is fixed`)
    await payload.delete({
      collection: 'follows',
      id: second.id,
      user: nonAdmin,
      overrideAccess: false,
    })
    payload.logger.info('cleanup delete OK')
  } catch (err) {
    payload.logger.error({ err, msg: 'FOLLOW CREATE FAILED — this is the bug' })
  }

  process.exit(0)
}

void main()

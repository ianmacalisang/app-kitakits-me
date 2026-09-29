// Preps the follow-button e2e repro: creates a fresh non-admin user and clears
// any existing follow toward the target.
import 'dotenv/config'

import { getPayload } from 'payload'

import configPromise from '../src/payload.config'

const EMAIL = 'e2efollow@test.local'
const PASS = 'testpassword1'
const TARGET_USERNAME = 'kitakitsofficial'

const main = async () => {
  const payload = await getPayload({ config: configPromise })

  await payload.delete({ collection: 'users', where: { email: { equals: EMAIL } } })
  const actor = await payload.create({
    collection: 'users',
    data: {
      email: EMAIL,
      password: PASS,
      name: 'E2E Follow',
      username: 'e2efollow',
      role: 'user',
      onboardedAt: new Date().toISOString(),
    },
  })
  const target = await payload.find({
    collection: 'users',
    where: { username: { equals: TARGET_USERNAME } },
    limit: 1,
    depth: 0,
  })
  if (!target.docs[0]) {
    payload.logger.error(`target ${TARGET_USERNAME} not found`)
    process.exit(1)
  }
  await payload.delete({
    collection: 'follows',
    where: {
      and: [{ follower: { equals: actor.id } }, { following: { equals: target.docs[0].id } }],
    },
    overrideAccess: true,
  })
  payload.logger.info(`ready: ${actor.username} (id ${actor.id}) -> ${TARGET_USERNAME}`)
  process.exit(0)
}

void main()

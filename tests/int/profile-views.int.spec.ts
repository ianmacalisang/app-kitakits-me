import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { User } from '@/payload-types'
import { getFollowingActivities } from '@/lib/activities'
import { recordProfileView } from '@/lib/profileViews'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
let alice: User // tracking on — records views
let bob: User // tracking on — profile owner
let carol: User // tracking off

// Server actions pass the session user (which carries `collection`) into
// Local API ops — mirror that shape here.
const asUser = (user: User) => ({ ...user, collection: 'users' as const })

const findPair = (viewerId: number, viewedId: number) =>
  payload.find({
    collection: 'profile-views',
    where: {
      and: [{ viewer: { equals: viewerId } }, { viewed: { equals: viewedId } }],
    },
    depth: 0,
  })

const setTracking = (user: User, on: boolean) =>
  payload.update({
    collection: 'users',
    id: user.id,
    data: { profileViewTracking: on },
  })

describe('Profile views', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    const [a, b, c] = await Promise.all([
      payload.create({
        collection: 'users',
        data: {
          email: `pview-a${stamp}@test.dev`,
          password: 'password123',
          name: 'alice',
          username: `pviewa${stamp}`.slice(0, 30),
          role: 'user',
          profileViewTracking: true,
        },
      }),
      payload.create({
        collection: 'users',
        data: {
          email: `pview-b${stamp}@test.dev`,
          password: 'password123',
          name: 'bob',
          username: `pviewb${stamp}`.slice(0, 30),
          role: 'user',
          profileViewTracking: true,
        },
      }),
      payload.create({
        collection: 'users',
        data: {
          email: `pview-c${stamp}@test.dev`,
          password: 'password123',
          name: 'carol',
          username: `pviewc${stamp}`.slice(0, 30),
          role: 'user',
        },
      }),
    ])
    alice = a as User
    bob = b as User
    carol = c as User
  })

  afterAll(async () => {
    if (!payload || !alice) return
    // Rows FK-reference both users, so they must go first.
    await payload.delete({
      collection: 'profile-views',
      where: {
        or: [
          { viewer: { in: [alice.id, bob.id, carol.id] } },
          { viewed: { in: [alice.id, bob.id, carol.id] } },
        ],
      },
    })
    for (const user of [alice, bob, carol]) {
      if (user) await payload.delete({ collection: 'users', id: user.id })
    }
  })

  it('defaults the privacy toggle off', () => {
    expect(carol.profileViewTracking).toBeFalsy()
  })

  it('records a view for an opted-in viewer', async () => {
    await recordProfileView(payload, asUser(alice), bob.id)
    const rows = await findPair(alice.id, bob.id)
    expect(rows.totalDocs).toBe(1)
    expect(rows.docs[0].viewCount).toBe(1)
  })

  it('upserts repeat views instead of creating duplicates', async () => {
    await recordProfileView(payload, asUser(alice), bob.id)
    const rows = await findPair(alice.id, bob.id)
    expect(rows.totalDocs).toBe(1)
    expect(rows.docs[0].viewCount).toBe(2)
  })

  it('records nothing for opted-out viewers or self views', async () => {
    await recordProfileView(payload, asUser(carol), alice.id)
    await recordProfileView(payload, asUser(alice), alice.id)
    const rows = await payload.find({
      collection: 'profile-views',
      where: {
        or: [
          { viewer: { equals: carol.id } },
          { and: [{ viewer: { equals: alice.id } }, { viewed: { equals: alice.id } }] },
        ],
      },
      depth: 0,
    })
    expect(rows.totalDocs).toBe(0)
  })

  it('denies direct creates from users without the toggle on', async () => {
    await expect(
      payload.create({
        collection: 'profile-views',
        data: { viewer: carol.id, viewed: alice.id },
        user: asUser(carol),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('scopes reads to the profile owner', async () => {
    const own = await payload.find({
      collection: 'profile-views',
      where: { viewed: { equals: bob.id } },
      depth: 0,
      user: asUser(bob),
      overrideAccess: false,
    })
    expect(own.totalDocs).toBe(1)

    const others = await payload.find({
      collection: 'profile-views',
      where: { viewed: { equals: bob.id } },
      depth: 0,
      user: asUser(carol),
      overrideAccess: false,
    })
    expect(others.totalDocs).toBe(0)
  })

  it('surfaces the view in the owner activities feed', async () => {
    const feed = await getFollowingActivities(asUser(bob), { authorIds: [], followerIds: [] }, 1)
    const item = feed.items.find((entry) => entry.type === 'profile_view')
    expect(item?.actorUsername).toBe(alice.username)
  })

  it('hides a viewer who opts out after recording', async () => {
    await setTracking(alice, false)
    const feed = await getFollowingActivities(asUser(bob), { authorIds: [], followerIds: [] }, 1)
    expect(feed.items.some((entry) => entry.type === 'profile_view')).toBe(false)
    await setTracking(alice, true)
  })

  it('hides the whole list when the owner opts out', async () => {
    await setTracking(bob, false)
    // The seeded `bob` doc still carries the old flag — production feeds get
    // a fresh user doc from payload.auth on every request, so refetch here.
    const freshBob = (await payload.findByID({
      collection: 'users',
      id: bob.id,
      depth: 0,
    })) as User
    const feed = await getFollowingActivities(
      asUser(freshBob),
      { authorIds: [], followerIds: [] },
      1,
    )
    expect(feed.items.some((entry) => entry.type === 'profile_view')).toBe(false)
    await setTracking(bob, true)
  })
})

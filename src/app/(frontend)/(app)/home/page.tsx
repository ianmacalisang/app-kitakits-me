import { redirect } from 'next/navigation'

import { HomeTabs } from '@/components/HomeTabs'
import { getFollowingActivities } from '@/lib/activities'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { FEED_PAGE_SIZE, getSavedPosts, hydratePosts, mediaFilterClauses } from '@/lib/posts'
import { type MediaFilter, relId } from '@/lib/serialize'
import type { Post } from '@/payload-types'

export const metadata = { title: 'Home' }

const MEDIA_FILTERS = new Set<MediaFilter>(['all', 'media', 'images', 'videos'])

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ media?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // ?media=images|videos persists the feed filter across refreshes — apply
  // it server-side so the first paint is already filtered.
  const raw = (await searchParams).media
  const mediaFilter: MediaFilter =
    raw && MEDIA_FILTERS.has(raw as MediaFilter) ? (raw as MediaFilter) : 'all'

  const payload = await getPayloadClient()

  // Cap at 2000 followees — more than enough for any realistic social graph.
  // Users following beyond this will still see the most recent 2000 authors.
  const following = await payload.find({
    collection: 'follows',
    where: { follower: { equals: user.id } },
    limit: 2000,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const authorIds = following.docs
    .map((f) => relId(f.following))
    .filter((id): id is number => id !== null)

  const [posts, activities, saved] = await Promise.all([
    authorIds.length === 0
      ? Promise.resolve({ docs: [] as Post[], hasNextPage: false })
      : payload.find({
          collection: 'posts',
          where: { and: [{ author: { in: authorIds } }, ...mediaFilterClauses(mediaFilter)] },
          sort: '-createdAt',
          page: 1,
          limit: FEED_PAGE_SIZE,
          depth: 2,
          user,
          overrideAccess: false,
        }),
    getFollowingActivities(user, authorIds, 1),
    getSavedPosts(user, 1),
  ])

  const cards = await hydratePosts(posts.docs, user)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Home</h1>
      <HomeTabs
        feedPosts={cards}
        feedHasMore={posts.hasNextPage}
        initialMediaFilter={mediaFilter}
        activityItems={activities.items}
        activityHasMore={activities.hasMore}
        savedPosts={saved.posts}
        savedHasMore={saved.hasMore}
      />
    </div>
  )
}

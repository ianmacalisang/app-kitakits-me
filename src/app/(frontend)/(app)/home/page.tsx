import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { HomeTabs } from '@/components/HomeTabs'
import {
  ActivityIcon,
  BookmarkIcon,
  ChevronRightIcon,
  HomeIcon,
  QrCodeIcon,
} from '@/components/icons'
import { PostListSkeleton } from '@/components/PostListSkeleton'
import { getFollowingActivities } from '@/lib/activities'
import { getCurrentUser } from '@/lib/auth'
import { isPostCategory, type PostCategory } from '@/lib/categories'
import { getMutuals } from '@/lib/mutuals'
import { getPayloadClient } from '@/lib/payload'
import {
  FEED_PAGE_SIZE,
  categoryFilterClauses,
  getSavedPosts,
  hydratePosts,
  mediaFilterClauses,
} from '@/lib/posts'
import { type MediaFilter, relId } from '@/lib/serialize'
import type { Post } from '@/payload-types'

export const metadata = { title: 'Home' }

const MEDIA_FILTERS = new Set<MediaFilter>(['all', 'media', 'images', 'videos'])

// Static shell — renders instantly; only the post list area suspends so the
// QR card and tab chrome are visible while feed data loads.
export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ media?: string; category?: string }>
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Home</h1>
      <Link
        href="/invite"
        className="glass group flex items-center gap-3.5 rounded-3xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-300/60 hover:shadow-lg hover:shadow-accent-600/10"
      >
        <span className="btn-accent-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <QrCodeIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-neutral-800">Your invite code</span>
          <span className="block text-xs text-neutral-500">
            Share it with friends — a quick scan and you&apos;ll follow each other instantly.
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <Suspense fallback={<HomeFeedFallback />}>
        <HomeFeed searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

// Suspense fallback: a non-interactive replica of the HomeTabs pill (Feed
// active) over the post skeletons, so only the list area shows a loader.
function HomeFeedFallback() {
  const tabs = [
    { label: 'Feed', icon: HomeIcon },
    { label: 'Activities', icon: ActivityIcon },
    { label: 'Saved', icon: BookmarkIcon },
  ]
  return (
    <section aria-busy="true" aria-label="Loading home feed">
      <div className="glass mb-3 rounded-3xl p-4">
        <div className="mb-3 h-3 w-24 animate-pulse rounded-full bg-neutral-200/70" />
        <div className="flex gap-4 overflow-hidden pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex w-20 shrink-0 flex-col items-center gap-1.5">
              <span className="h-20 w-20 animate-pulse rounded-full bg-neutral-200/70" />
              <span className="h-2.5 w-12 animate-pulse rounded-full bg-neutral-200/70" />
            </div>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <div className="glass relative flex rounded-full p-1">
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-gradient-to-br from-accent-500 to-accent-600 shadow-md shadow-accent-600/30"
          />
          {tabs.map(({ label, icon: Icon }, i) => (
            <span
              key={label}
              className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-semibold ${
                i === 0 ? 'text-white' : 'text-neutral-500'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </span>
          ))}
        </div>
      </div>
      <PostListSkeleton />
    </section>
  )
}

async function HomeFeed({
  searchParams,
}: {
  searchParams: Promise<{ media?: string; category?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // ?media=images|videos and ?category=x persist the feed filters across
  // refreshes — apply them server-side so the first paint is already filtered.
  const { media: rawMedia, category: rawCategory } = await searchParams
  const mediaFilter: MediaFilter =
    rawMedia && MEDIA_FILTERS.has(rawMedia as MediaFilter) ? (rawMedia as MediaFilter) : 'all'
  const categoryFilter: PostCategory | 'all' = isPostCategory(rawCategory) ? rawCategory : 'all'

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

  const [posts, activities, saved, mutuals] = await Promise.all([
    authorIds.length === 0
      ? Promise.resolve({ docs: [] as Post[], hasNextPage: false })
      : payload.find({
          collection: 'posts',
          where: {
            and: [
              { author: { in: authorIds } },
              ...mediaFilterClauses(mediaFilter),
              ...categoryFilterClauses(categoryFilter),
            ],
          },
          sort: '-createdAt',
          page: 1,
          limit: FEED_PAGE_SIZE,
          depth: 2,
          user,
          overrideAccess: false,
        }),
    getFollowingActivities(user, authorIds, 1),
    getSavedPosts(user, 1),
    getMutuals(user),
  ])

  const cards = await hydratePosts(posts.docs, user)

  return (
    <HomeTabs
      mutuals={mutuals}
      feedPosts={cards}
      feedHasMore={posts.hasNextPage}
      initialMediaFilter={mediaFilter}
      initialCategory={categoryFilter}
      activityItems={activities.items}
      activityHasMore={activities.hasMore}
      savedPosts={saved.posts}
      savedHasMore={saved.hasMore}
      savedCount={saved.total}
    />
  )
}

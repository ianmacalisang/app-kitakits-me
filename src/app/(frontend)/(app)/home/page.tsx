import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cache, Suspense } from 'react'

import { ActivitiesView, LazyActivities } from '@/components/ActivitiesView'
import { ActivityListSkeleton } from '@/components/ActivityListSkeleton'
import { Feed } from '@/components/Feed'
import { HomeTabs } from '@/components/HomeTabs'
import {
  ActivityIcon,
  BookmarkIcon,
  ChevronRightIcon,
  HomeIcon,
  QrCodeIcon,
  UsersIcon,
} from '@/components/icons'
import { OnlineMutuals } from '@/components/OnlineMutuals'
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
import { HOME_TABS, type HomeTab } from '@/lib/tabs'
import type { Post, User } from '@/payload-types'

export const metadata = { title: 'Home' }

const MEDIA_FILTERS = new Set<MediaFilter>(['all', 'media', 'images', 'videos'])

// Followee ids power both the feed and activities panels — cache() dedupes the
// query so the two Suspense boundaries don't each fetch the follow list.
// Cap at 2000 followees — more than enough for any realistic social graph.
// Users following beyond this will still see the most recent 2000 authors.
const getFolloweeIds = cache(async (user: User) => {
  const payload = await getPayloadClient()
  const following = await payload.find({
    collection: 'follows',
    where: { follower: { equals: user.id } },
    limit: 2000,
    depth: 0,
    pagination: false,
    user,
    overrideAccess: false,
  })
  return following.docs.map((f) => relId(f.following)).filter((id): id is number => id !== null)
})

// Static shell — renders instantly; the invite card and outer chrome are
// visible while the tab pill and panels stream in.
export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ media?: string; category?: string; tab?: string }>
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

// Placeholder for the mutuals rail while its query streams in — mirrors the
// glass card's shape so the pill doesn't jump when the real rail lands.
function MutualsRailSkeleton() {
  return (
    <div aria-hidden className="glass mb-3 rounded-3xl p-4">
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
  )
}

// Tab shell — resolves after just auth + searchParams, so the pill paints
// while each tab's data loads behind its own Suspense boundary. A slow query
// can no longer hold up the rest of the page.
async function HomeFeed({
  searchParams,
}: {
  searchParams: Promise<{ media?: string; category?: string; tab?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // ?media=images|videos, ?category=x, and ?tab=x persist the feed filters and
  // selected tab across refreshes — validated here so the first paint is right.
  const { media: rawMedia, category: rawCategory, tab: rawTab } = await searchParams
  const mediaFilter: MediaFilter =
    rawMedia && MEDIA_FILTERS.has(rawMedia as MediaFilter) ? (rawMedia as MediaFilter) : 'all'
  const categoryFilter: PostCategory | 'all' = isPostCategory(rawCategory) ? rawCategory : 'all'
  const initialTab: HomeTab | undefined = (HOME_TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as HomeTab)
    : undefined

  // Left un-awaited — HomeTabs reads it via use() inside its own Suspense, so
  // the badge streams in without holding up the pill. A failed count just
  // hides the badge.
  const savedCount = (async () => {
    const payload = await getPayloadClient()
    const result = await payload.count({
      collection: 'saves',
      where: { user: { equals: user.id } },
      user,
      overrideAccess: false,
    })
    return result.totalDocs
  })().catch(() => 0)

  return (
    <HomeTabs
      initialTab={initialTab}
      savedCount={savedCount}
      mutualsRail={
        <Suspense fallback={<MutualsRailSkeleton />}>
          <MutualsRail />
        </Suspense>
      }
      feedPanel={
        <Suspense fallback={<PostListSkeleton />}>
          <FeedPanel mediaFilter={mediaFilter} categoryFilter={categoryFilter} />
        </Suspense>
      }
      // The activities query only runs when the tab is opened: direct
      // ?tab=activities loads SSR the panel, every other initial load defers
      // to a client-side fetch on first activation.
      activitiesPanel={
        initialTab === 'activities' ? (
          <Suspense fallback={<ActivityListSkeleton />}>
            <ActivitiesPanel />
          </Suspense>
        ) : (
          <LazyActivities />
        )
      }
      savedPanel={
        <Suspense fallback={<PostListSkeleton />}>
          <SavedPanel />
        </Suspense>
      }
    />
  )
}

// Suspense fallback: a non-interactive replica of the rail + HomeTabs pill
// (Feed active) over post skeletons — only shown until auth + params resolve.
function HomeFeedFallback() {
  const tabs = [
    { label: 'Feed', icon: HomeIcon },
    { label: 'Activities', icon: ActivityIcon },
    { label: 'Saved', icon: BookmarkIcon },
  ]
  return (
    <section aria-busy="true" aria-label="Loading home feed">
      <MutualsRailSkeleton />
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

async function MutualsRail() {
  const user = await getCurrentUser()
  if (!user) return null
  const mutuals = await getMutuals(user)
  return <OnlineMutuals mutuals={mutuals} />
}

async function FeedPanel({
  mediaFilter,
  categoryFilter,
}: {
  mediaFilter: MediaFilter
  categoryFilter: PostCategory | 'all'
}) {
  const user = await getCurrentUser()
  if (!user) return null
  const payload = await getPayloadClient()
  const authorIds = await getFolloweeIds(user)

  // One row past the page size answers "is there more" — pagination: false
  // skips the COUNT query a paginated find would run alongside the select.
  const posts =
    authorIds.length === 0
      ? { docs: [] as Post[], more: false }
      : await payload
          .find({
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
            limit: FEED_PAGE_SIZE + 1,
            depth: 2,
            pagination: false,
            user,
            overrideAccess: false,
          })
          .then((result) => ({
            docs: result.docs.slice(0, FEED_PAGE_SIZE),
            more: result.docs.length > FEED_PAGE_SIZE,
          }))

  const cards = await hydratePosts(posts.docs, user)

  return (
    <Feed
      initialPosts={cards}
      initialHasMore={posts.more}
      feed="following"
      live
      filterable
      initialMediaFilter={mediaFilter}
      initialCategory={categoryFilter}
      emptyIcon={<UsersIcon />}
      emptyTitle="Your feed is empty"
      emptyMessage="Follow people on the Explore page to see their posts."
      emptyAction={
        <Link href="/explore" className="btn-primary mt-1 rounded-full px-5 py-2 text-sm">
          Explore people
        </Link>
      }
    />
  )
}

async function ActivitiesPanel() {
  const user = await getCurrentUser()
  if (!user) return null
  const authorIds = await getFolloweeIds(user)
  const activities = await getFollowingActivities(user, authorIds, 1)
  return <ActivitiesView activities={activities.items} initialHasMore={activities.hasMore} />
}

async function SavedPanel() {
  const user = await getCurrentUser()
  if (!user) return null
  const saved = await getSavedPosts(user, 1)
  return (
    <Feed
      initialPosts={saved.posts}
      initialHasMore={saved.hasMore}
      feed="saved"
      emptyIcon={<BookmarkIcon />}
      emptyTitle="No saved posts yet"
      emptyMessage="Tap the bookmark on a post to save it here."
    />
  )
}

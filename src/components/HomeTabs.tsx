'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { ActivityData, MediaFilter, PostCardData } from '@/lib/serialize'

import { ActivitiesView } from './ActivitiesView'
import { CountBadge } from './CountBadge'
import { Feed } from './Feed'
import { ActivityIcon, BookmarkIcon, HomeIcon, UsersIcon } from './icons'

type Tab = 'feed' | 'activities' | 'saved'

const TABS: { value: Tab; label: string; icon: typeof HomeIcon }[] = [
  { value: 'feed', label: 'Feed', icon: HomeIcon },
  { value: 'activities', label: 'Activities', icon: ActivityIcon },
  { value: 'saved', label: 'Saved', icon: BookmarkIcon },
]

const THUMB_POSITION: Record<Tab, string> = {
  feed: 'translate-x-0',
  activities: 'translate-x-full',
  saved: 'translate-x-[200%]',
}

// Feed / Activities / Saved segmented control for the home page — a glass
// pill with a sliding gradient thumb. All feeds stay mounted (hidden when
// inactive) so tab switches preserve scroll position and pagination state.
export function HomeTabs({
  feedPosts,
  feedHasMore,
  initialMediaFilter = 'all',
  activityItems,
  activityHasMore,
  savedPosts,
  savedHasMore,
  savedCount,
}: {
  feedPosts: PostCardData[]
  feedHasMore: boolean
  initialMediaFilter?: MediaFilter
  activityItems: ActivityData[]
  activityHasMore: boolean
  savedPosts: PostCardData[]
  savedHasMore: boolean
  savedCount: number
}) {
  const [tab, setTab] = useState<Tab>('feed')

  return (
    <section>
      <div role="tablist" aria-label="Home feed" className="mb-3">
        <div className="glass relative flex rounded-full p-1">
          {/* Sliding thumb — covers the active tab; with three equal tabs each
              full-width translate lands exactly on the next tab. */}
          <span
            aria-hidden
            className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-gradient-to-br from-accent-500 to-accent-600 shadow-md shadow-accent-600/30 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${THUMB_POSITION[tab]}`}
          />
          {TABS.map(({ value, label, icon: Icon }) => {
            const active = tab === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(value)}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-semibold transition-colors duration-300 active:scale-[0.98] ${
                  active ? 'text-white' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {value === 'saved' && <CountBadge count={savedCount} onAccent={active} />}
              </button>
            )
          })}
        </div>
      </div>

      <div role="tabpanel" hidden={tab !== 'feed'}>
        <Feed
          initialPosts={feedPosts}
          initialHasMore={feedHasMore}
          feed="following"
          filterable
          initialMediaFilter={initialMediaFilter}
          emptyIcon={<UsersIcon />}
          emptyTitle="Your feed is empty"
          emptyMessage="Follow people on the Explore page to see their posts."
          emptyAction={
            <Link href="/explore" className="btn-primary mt-1 rounded-full px-5 py-2 text-sm">
              Explore people
            </Link>
          }
        />
      </div>
      <div role="tabpanel" hidden={tab !== 'activities'}>
        <ActivitiesView activities={activityItems} initialHasMore={activityHasMore} />
      </div>
      <div role="tabpanel" hidden={tab !== 'saved'}>
        <Feed
          initialPosts={savedPosts}
          initialHasMore={savedHasMore}
          feed="saved"
          emptyIcon={<BookmarkIcon />}
          emptyTitle="No saved posts yet"
          emptyMessage="Tap the bookmark on a post to save it here."
        />
      </div>
    </section>
  )
}

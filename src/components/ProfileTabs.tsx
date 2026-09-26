'use client'

import { useEffect, useRef, useState } from 'react'

import type { AboutBlockData, PostCardData } from '@/lib/serialize'

import { AboutSection } from './AboutSection'
import { ConnectionsPanel } from './ConnectionsPanel'
import { Feed } from './Feed'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  ListIcon,
  PinIcon,
  UserIcon,
  UsersIcon,
} from './icons'
import { MediaGrid } from './MediaGrid'
import { PostCard } from './PostCard'

type Tab = 'about' | 'posts' | 'media' | 'connections'

const TABS: { value: Tab; label: string; icon: typeof UserIcon }[] = [
  { value: 'about', label: 'About', icon: UserIcon },
  { value: 'posts', label: 'Posts', icon: ListIcon },
  { value: 'media', label: 'Photos', icon: ImageIcon },
  { value: 'connections', label: 'Connections', icon: UsersIcon },
]

// Posts / About / Media / Connections segmented control for the profile page.
export function ProfileTabs({
  initialPosts,
  initialHasMore,
  pinnedPosts,
  authorId,
  about,
  isSelf,
  username,
  followerCount,
  followingCount,
  isPublicPage = false,
}: {
  initialPosts: PostCardData[]
  initialHasMore: boolean
  pinnedPosts: PostCardData[]
  authorId: number
  about: AboutBlockData[]
  isSelf: boolean
  username: string
  followerCount: number
  followingCount: number
  isPublicPage?: boolean
}) {
  const [tab, setTab] = useState<Tab>('about')
  // Panels mount lazily on first visit, then stay mounted (hidden) so tab
  // switches don't lose Feed pagination or refetch the media grid.
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set(['about']))
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // The public page hides Connections — only signed-in users see it.
  const tabs = isPublicPage ? TABS.filter((t) => t.value !== 'connections') : TABS
  const activeIndex = tabs.findIndex((t) => t.value === tab)

  // Pinned-posts carousel — chevron buttons scroll the rail and hide at the
  // edges so there's no visible scrollbar.
  const pinnedRailRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateRailEdges = () => {
    const rail = pinnedRailRef.current
    if (!rail) return
    setCanScrollLeft(rail.scrollLeft > 4)
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4)
  }

  useEffect(updateRailEdges, [pinnedPosts.length, tab])

  const scrollRail = (dir: 1 | -1) => {
    pinnedRailRef.current?.scrollBy({
      left: dir * pinnedRailRef.current.clientWidth * 0.85,
      behavior: 'smooth',
    })
  }

  const select = (next: Tab) => {
    setTab(next)
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
  }

  // WAI-ARIA tabs keyboard pattern — selection follows focus, so arrows move
  // the thumb and switch the panel in one step.
  const onTabListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (activeIndex + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (activeIndex - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    select(tabs[next].value)
    tabRefs.current[next]?.focus()
  }

  return (
    <section>
      {/* Sticks under the floating app nav while scrolling (top-20 = nav
          bottom + gap); the public page has no nav, so top-3. */}
      <div
        role="tablist"
        aria-label="Profile sections"
        onKeyDown={onTabListKeyDown}
        className={`sticky z-10 mb-4 ${isPublicPage ? 'top-3' : 'top-20'}`}
      >
        <div className="glass relative flex rounded-full p-1">
          {/* Sliding thumb — equal flex-1 tabs, so each step is 100% of the
              thumb's own width (width set inline since tab count varies). */}
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 shadow-md shadow-accent-600/30 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
            style={{
              width: `calc(${100 / tabs.length}% - 0.125rem)`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
          {tabs.map(({ value, label, icon: Icon }, index) => {
            const active = tab === value
            return (
              <button
                key={value}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                type="button"
                role="tab"
                id={`profile-tab-${value}`}
                aria-selected={active}
                aria-controls={`profile-panel-${value}`}
                aria-label={label}
                tabIndex={active ? 0 : -1}
                onClick={() => select(value)}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold transition-colors duration-300 active:scale-[0.98] ${
                  active ? 'text-white' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {visited.has('about') && (
        <div
          role="tabpanel"
          id="profile-panel-about"
          aria-labelledby="profile-tab-about"
          hidden={tab !== 'about'}
        >
          <div className="flex flex-col gap-4">
            {pinnedPosts.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 px-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-md shadow-accent-600/30">
                    <PinIcon className="h-3 w-3" filled />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent-700/70">
                    Pinned posts
                  </span>
                  {pinnedPosts.length > 1 && (
                    <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                      {pinnedPosts.length}
                    </span>
                  )}
                </h2>
                {pinnedPosts.length === 1 ? (
                  <PostCard post={pinnedPosts[0]} />
                ) : (
                  /* Horizontal snap carousel — 85% cards peek the next one into
                     view, the mask fades the right edge, chevrons navigate. */
                  <div className="relative">
                    <div
                      ref={pinnedRailRef}
                      onScroll={updateRailEdges}
                      className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]"
                    >
                      {pinnedPosts.map((post) => (
                        <div
                          key={post.id}
                          className="w-[85%] max-w-sm shrink-0 snap-start rounded-3xl ring-1 ring-accent-500/20 [&>article]:h-full"
                        >
                          <PostCard post={post} />
                        </div>
                      ))}
                    </div>
                    {canScrollLeft && (
                      <button
                        type="button"
                        aria-label="Scroll pinned posts left"
                        onClick={() => scrollRail(-1)}
                        className="glass absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                    )}
                    {canScrollRight && (
                      <button
                        type="button"
                        aria-label="Scroll pinned posts right"
                        onClick={() => scrollRail(1)}
                        className="glass absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            <AboutSection blocks={about} isSelf={isSelf} username={username} />
          </div>
        </div>
      )}
      {visited.has('posts') && (
        <div
          role="tabpanel"
          id="profile-panel-posts"
          aria-labelledby="profile-tab-posts"
          hidden={tab !== 'posts'}
        >
          <Feed
            initialPosts={initialPosts}
            initialHasMore={initialHasMore}
            authorId={authorId}
            emptyIcon={<ListIcon />}
            emptyTitle="No posts yet"
            emptyMessage={
              isSelf
                ? 'Posts you share will appear on your timeline.'
                : `@${username} hasn't posted anything yet.`
            }
            timeline
          />
        </div>
      )}
      {visited.has('media') && (
        <div
          role="tabpanel"
          id="profile-panel-media"
          aria-labelledby="profile-tab-media"
          hidden={tab !== 'media'}
        >
          <MediaGrid
            authorId={authorId}
            publicOnly={isPublicPage}
            emptyMessage={
              isSelf
                ? 'Photos you post will show up here.'
                : `@${username} hasn't shared photos yet.`
            }
          />
        </div>
      )}
      {visited.has('connections') && (
        <div
          role="tabpanel"
          id="profile-panel-connections"
          aria-labelledby="profile-tab-connections"
          hidden={tab !== 'connections'}
        >
          <ConnectionsPanel
            userId={authorId}
            followerCount={followerCount}
            followingCount={followingCount}
            isPublicPage={isPublicPage}
          />
        </div>
      )}
    </section>
  )
}

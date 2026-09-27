'use client'

import Link from 'next/link'
import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react'

import { type CategorySpotlight, searchPosts } from '@/actions/posts'
import { searchUsers } from '@/actions/users'
import { CATEGORY_TINTS, postCategory } from '@/lib/categories'
import type { PostCardData, UserCardData } from '@/lib/serialize'

import { CATEGORY_ICONS } from './CategoryChip'
import { EmptyState } from './EmptyState'
import { ExplorePostCard } from './ExplorePostCard'
import { PhotoPost } from './PhotoPost'
import { RailPostCard } from './RailPostCard'
import { ReelPost } from './ReelPost'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CommentIcon,
  CompassIcon,
  ListIcon,
  QuestionIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
} from './icons'
import { LoadSentinel } from './LoadSentinel'
import { Spinner } from './Spinner'
import { UserCoverCard } from './UserCoverCard'

type Section = 'people' | 'posts'

export function ExploreSearch({
  initialQuery = '',
  trendingTags = [],
  hotDiscussions = [],
  unansweredPosts = [],
  spotlights = [],
  initialUsers,
  initialUsersHasMore,
  initialPosts,
  initialPostsHasMore,
}: {
  initialQuery?: string
  trendingTags?: string[]
  hotDiscussions?: PostCardData[]
  unansweredPosts?: PostCardData[]
  spotlights?: CategorySpotlight[]
  initialUsers: UserCardData[]
  initialUsersHasMore: boolean
  initialPosts: PostCardData[]
  initialPostsHasMore: boolean
}) {
  // The query only ever comes from the URL (header search, tag chips) — the
  // page has no input, so it can't change while mounted.
  const query = initialQuery.trim()
  const [users, setUsers] = useState(initialUsers)
  const [usersPage, setUsersPage] = useState(1)
  const [usersMore, setUsersMore] = useState(initialUsersHasMore)
  const [posts, setPosts] = useState(initialPosts)
  const [postsPage, setPostsPage] = useState(1)
  const [postsMore, setPostsMore] = useState(initialPostsHasMore)
  const [morePending, startMoreTransition] = useTransition()

  const loadMore = (section: Section) => {
    if (morePending) return
    const next = (section === 'people' ? usersPage : postsPage) + 1
    startMoreTransition(async () => {
      if (section === 'people') {
        const result = await searchUsers(query, next)
        setUsers((prev) => {
          const seen = new Set(prev.map((u) => u.id))
          return [...prev, ...result.items.filter((u) => !seen.has(u.id))]
        })
        setUsersPage(next)
        setUsersMore(result.hasMore)
      } else {
        const result = await searchPosts(query, next)
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          return [...prev, ...result.items.filter((p) => !seen.has(p.id))]
        })
        setPostsPage(next)
        setPostsMore(result.hasMore)
      }
    })
  }

  return (
    <div>
      <header className="glass relative mb-4 overflow-hidden rounded-3xl p-4 sm:p-5">
        {/* Graph-paper grid fading toward the bottom-right */}
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_80%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)]"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-md shadow-accent-600/30">
            <CompassIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
            <p className="truncate text-sm text-neutral-500">
              {query ? (
                <>
                  Results for <span className="font-semibold text-neutral-800">“{query}”</span>
                </>
              ) : (
                'Trending posts, hot discussions, and people you may know.'
              )}
            </p>
          </div>
          {query ? (
            <Link
              href="/explore"
              className="glass relative ml-auto flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:text-neutral-900"
            >
              <XIcon className="h-3.5 w-3.5" />
              Clear
            </Link>
          ) : null}
        </div>
      </header>

      {/* Trending hashtag chips — hidden while searching */}
      {!query && trendingTags.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight text-neutral-700 dark:text-neutral-200">
            <SparklesIcon className="h-4 w-4 text-accent-500" />
            Trending tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {trendingTags.map((tag) => (
              <Link
                key={tag}
                href={`/explore?q=${encodeURIComponent(tag)}`}
                className="rounded-full bg-black/5 px-3 py-1 text-[13px] text-neutral-600 transition-colors hover:bg-accent-500/15 hover:text-accent-800"
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>
      )}

      <PeopleResults users={users} query={query} />

      {/* A button rather than a sentinel — auto-loading people here would keep
          pushing the posts section down the page. */}
      {usersMore && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => loadMore('people')}
            disabled={morePending}
            className="flex items-center gap-2 rounded-full bg-black/5 px-4 py-1.5 text-[13px] text-neutral-600 transition-colors hover:bg-black/10 disabled:opacity-60"
          >
            {morePending ? <Spinner className="h-3.5 w-3.5" /> : null}
            Show more people
          </button>
        </div>
      )}

      {/* Trending posts — horizontal rail of media tiles; a sentinel at the
          end pages more posts in as it scrolls. */}
      {!query && (
        <PostRail
          label={
            <>
              <SparklesIcon className="h-[18px] w-[18px] text-accent-500" />
              Trending posts
            </>
          }
          posts={posts}
          emptyState={<EmptyState icon={<ListIcon />} title="No posts yet" />}
          tileClass="w-72 sm:w-80"
          hasMore={postsMore}
          pending={morePending}
          onLoad={() => loadMore('posts')}
        />
      )}

      {/* Discovery sections — hidden while searching, self-hiding when empty */}
      {!query && (
        <>
          <SpotlightRail
            spotlight={{ category: 'tanong', posts: unansweredPosts }}
            label="Be the first to answer"
            tileClass="w-72 sm:w-80"
            aspectClass="aspect-[4/3]"
            overlaySnippet
            badge={
              <span className="flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                <QuestionIcon className="h-3 w-3" />
                Unanswered
              </span>
            }
          />

          <PostRail
            label={
              <>
                <CommentIcon className="h-[18px] w-[18px] text-accent-500" />
                Hot discussions
              </>
            }
            posts={hotDiscussions}
          />

          {spotlights.map((spotlight) => (
            <SpotlightRail key={spotlight.category} spotlight={spotlight} />
          ))}
        </>
      )}

      {query && (
        <>
          <PostResults posts={posts} query={query} />
          <LoadSentinel
            hasMore={postsMore}
            pending={morePending}
            onLoadAction={() => loadMore('posts')}
          />
        </>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex gap-2.5">
      {/* Accent bar echoing the hero's gradient icon chip */}
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full bg-gradient-to-b from-accent-400 to-accent-600"
      />
      <p className="flex min-w-0 items-center gap-2 text-base font-bold tracking-tight text-neutral-800 dark:text-neutral-100">
        {children}
      </p>
    </div>
  )
}

// Horizontal snap rail — cards scroll sideways, chevrons hide at the edges,
// right edge fades out (same pattern as the pinned-posts rail). Shared by
// the user and post rails; hides entirely when empty unless an emptyState
// is given. Items start-aligned so mixed-height cards don't stretch.
function Rail({
  label,
  count,
  emptyState,
  children,
}: {
  label: ReactNode
  count: number
  emptyState?: ReactNode
  children: ReactNode
}) {
  const railRef = useRef<HTMLUListElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateRailEdges = () => {
    const rail = railRef.current
    if (!rail) return
    setCanScrollLeft(rail.scrollLeft > 4)
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4)
  }

  useEffect(() => {
    updateRailEdges()
    window.addEventListener('resize', updateRailEdges)
    return () => window.removeEventListener('resize', updateRailEdges)
  }, [count])

  const scrollRail = (dir: 1 | -1) => {
    railRef.current?.scrollBy({
      left: dir * railRef.current.clientWidth * 0.85,
      behavior: 'smooth',
    })
  }

  if (count === 0 && !emptyState) return null

  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <div className="relative">
        <ul
          ref={railRef}
          onScroll={updateRailEdges}
          className="no-scrollbar flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]"
        >
          {children}
          {count === 0 && <li className="w-full">{emptyState}</li>}
        </ul>
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollRail(-1)}
            className="glass absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollRail(1)}
            className="glass absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </>
  )
}

function UserRail({
  label,
  users,
  emptyState,
}: {
  label: string
  users: UserCardData[]
  emptyState?: ReactNode
}) {
  return (
    <Rail label={label} count={users.length} emptyState={emptyState}>
      {users.map((user) => (
        <UserCoverCard key={user.id} user={user} className="w-44 shrink-0 snap-start sm:w-52" />
      ))}
    </Rail>
  )
}

// Rail of uniform media tiles — the queries behind these sections filter
// to posts with an image or video, so every tile has a thumbnail. `badge`
// stamps a pill on every tile's top-left corner (e.g. "Unanswered"). When
// `onLoad` is given, a sentinel item sits at the rail's end and pages more
// posts in as it scrolls into view horizontally.
function PostRail({
  label,
  posts,
  badge,
  emptyState,
  tileClass = 'w-52 sm:w-60',
  aspectClass,
  overlaySnippet = false,
  hasMore = false,
  pending = false,
  onLoad,
}: {
  label: ReactNode
  posts: PostCardData[]
  badge?: ReactNode
  emptyState?: ReactNode
  /** Width classes per tile — pair with aspectClass to control height. */
  tileClass?: string
  /** Tile aspect ratio — defaults to portrait 3:4 inside RailPostCard. */
  aspectClass?: string
  /** Center the post's snippet over the tile — question-card treatment. */
  overlaySnippet?: boolean
  hasMore?: boolean
  pending?: boolean
  onLoad?: () => void
}) {
  return (
    <Rail label={label} count={posts.length} emptyState={emptyState}>
      {posts.map((post) => (
        <li key={post.id} className={`shrink-0 snap-start ${tileClass}`}>
          <RailPostCard
            post={post}
            badge={badge}
            aspectClass={aspectClass}
            overlaySnippet={overlaySnippet}
          />
        </li>
      ))}
      {onLoad && hasMore && (
        <li className="flex shrink-0 snap-start items-center justify-center px-3">
          <LoadSentinel
            hasMore={hasMore}
            pending={pending}
            onLoadAction={onLoad}
            rootMargin="0px 400px"
          />
        </li>
      )}
    </Rail>
  )
}

function PeopleResults({ users, query }: { users: UserCardData[]; query: string }) {
  return (
    <UserRail
      label={query ? 'People' : 'People you may know'}
      users={users}
      emptyState={
        <EmptyState
          icon={query ? <SearchIcon /> : <UsersIcon />}
          title={query ? 'No people found' : 'No suggestions yet'}
          message={
            query ? `Nothing matches “${query}” — try a different search.` : 'Check back soon.'
          }
        />
      }
    />
  )
}

// "Hot in {category}" rail — tinted category icon in the section label.
function SpotlightRail({
  spotlight,
  label,
  badge,
  tileClass,
  aspectClass,
  overlaySnippet,
}: {
  spotlight: CategorySpotlight
  label?: string
  badge?: ReactNode
  tileClass?: string
  aspectClass?: string
  overlaySnippet?: boolean
}) {
  const entry = postCategory(spotlight.category)
  if (!entry || spotlight.posts.length === 0) return null
  const Icon = CATEGORY_ICONS[entry.icon]
  return (
    <PostRail
      label={
        <>
          <Icon className={`h-[18px] w-[18px] ${CATEGORY_TINTS[entry.tint].icon}`} />
          {label ?? `Hot in ${entry.label}`}
        </>
      }
      posts={spotlight.posts}
      badge={badge}
      tileClass={tileClass}
      aspectClass={aspectClass}
      overlaySnippet={overlaySnippet}
    />
  )
}

// Search results — vertical masonry with the classic bottom sentinel.
// (The unqueried trending list uses the horizontal PostRail instead.)
function PostResults({ posts, query }: { posts: PostCardData[]; query: string }) {
  return (
    <>
      <SectionLabel>Posts</SectionLabel>
      {posts.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title="No posts found"
          message={`Nothing matches “${query}” — try a different search.`}
        />
      ) : (
        <PostGrid posts={posts} />
      )}
    </>
  )
}

// Masonry — CSS columns; cards stay whole via break-inside-avoid and order
// flows down each column (same pattern as DiscoverFeed). Same card split as
// the feed's media filters — videos get the reel card, images the gallery
// card; shares and text posts keep the compact explore card.
function PostGrid({ posts }: { posts: PostCardData[] }) {
  return (
    <div className="columns-1 gap-3 lg:columns-2">
      {posts.map((post) => (
        <div key={post.id} className="mb-3 break-inside-avoid">
          {post.video ? (
            <ReelPost post={post} />
          ) : post.images.length > 0 ? (
            <PhotoPost post={post} />
          ) : (
            <ExplorePostCard post={post} />
          )}
        </div>
      ))}
    </div>
  )
}

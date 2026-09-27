'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'

import { searchPosts } from '@/actions/posts'
import { searchUsers } from '@/actions/users'
import type { PostCardData, UserCardData } from '@/lib/serialize'

import { EmptyState } from './EmptyState'
import { ExplorePostCard } from './ExplorePostCard'
import { PhotoPost } from './PhotoPost'
import { ReelPost } from './ReelPost'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CompassIcon,
  ListIcon,
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
  initialUsers,
  initialUsersHasMore,
  initialPosts,
  initialPostsHasMore,
}: {
  initialQuery?: string
  trendingTags?: string[]
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
                'See what’s trending in the community.'
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
          <p className="mb-2 flex items-center gap-1 text-xs font-medium text-neutral-400">
            <SparklesIcon className="h-3.5 w-3.5" />
            Trending
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

      <PostResults posts={posts} query={query} />

      <LoadSentinel
        hasMore={postsMore}
        pending={morePending}
        onLoadAction={() => loadMore('posts')}
      />
    </div>
  )
}

function PeopleResults({ users, query }: { users: UserCardData[]; query: string }) {
  // Chevron buttons scroll the rail and hide at the edges (pinned-rail pattern).
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
  }, [users.length])

  const scrollRail = (dir: 1 | -1) => {
    railRef.current?.scrollBy({
      left: dir * railRef.current.clientWidth * 0.85,
      behavior: 'smooth',
    })
  }

  return (
    <>
      <p className="mb-2 mt-6 text-xs font-medium text-neutral-400">
        {query ? 'People' : 'Suggested for you'}
      </p>
      {/* Horizontal snap rail — cards scroll sideways, right edge fades out
          (same pattern as the pinned-posts rail). */}
      <div className="relative">
        <ul
          ref={railRef}
          onScroll={updateRailEdges}
          className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]"
        >
          {users.map((user) => (
            <UserCoverCard key={user.id} user={user} className="w-44 shrink-0 snap-start sm:w-52" />
          ))}
          {users.length === 0 && (
            <li className="w-full">
              <EmptyState
                icon={query ? <SearchIcon /> : <UsersIcon />}
                title={query ? 'No people found' : 'No suggestions yet'}
                message={
                  query
                    ? `Nothing matches “${query}” — try a different search.`
                    : 'Check back soon.'
                }
              />
            </li>
          )}
        </ul>
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll people left"
            onClick={() => scrollRail(-1)}
            className="glass absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll people right"
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

function PostResults({ posts, query }: { posts: PostCardData[]; query: string }) {
  return (
    <>
      <p className="mb-2 mt-6 text-xs font-medium text-neutral-400">
        {query ? 'Posts' : 'Trending posts'}
      </p>
      {posts.length === 0 ? (
        <EmptyState
          icon={query ? <SearchIcon /> : <ListIcon />}
          title={query ? 'No posts found' : 'No posts yet'}
          message={query ? `Nothing matches “${query}” — try a different search.` : undefined}
        />
      ) : (
        // Masonry — CSS columns; cards stay whole via break-inside-avoid
        // and order flows down each column (same pattern as DiscoverFeed).
        // Same card split as the feed's media filters — videos get the
        // reel card, images the gallery card; shares and text posts keep
        // the compact explore card.
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
      )}
    </>
  )
}

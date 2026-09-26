'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { searchPosts } from '@/actions/posts'
import { searchUsers } from '@/actions/users'
import type { PostCardData, UserCardData } from '@/lib/serialize'

import { EmptyState } from './EmptyState'
import { ExplorePostCard } from './ExplorePostCard'
import { CompassIcon, ListIcon, SearchIcon, SparklesIcon, UsersIcon, XIcon } from './icons'
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
        {/* Decorative aurora washes + a faint compass watermark */}
        <span
          aria-hidden
          className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-accent-300/25 blur-3xl dark:bg-white/5"
        />
        <span
          aria-hidden
          className="absolute -bottom-16 left-1/4 h-36 w-36 rounded-full bg-accent-200/30 blur-3xl dark:bg-white/5"
        />
        <CompassIcon
          aria-hidden
          className="absolute -right-2 top-1/2 h-24 w-24 -translate-y-1/2 rotate-12 text-accent-500/10"
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
  return (
    <>
      <p className="mb-2 mt-6 text-xs font-medium text-neutral-400">
        {query ? 'People' : 'Suggested for you'}
      </p>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {users.map((user) => (
          <UserCoverCard key={user.id} user={user} />
        ))}
        {users.length === 0 && (
          <li className="col-span-full">
            <EmptyState
              icon={query ? <SearchIcon /> : <UsersIcon />}
              title={query ? 'No people found' : 'No suggestions yet'}
              message={
                query ? `Nothing matches “${query}” — try a different search.` : 'Check back soon.'
              }
            />
          </li>
        )}
      </ul>
    </>
  )
}

// Row spans for the two-column grid: video posts, 3+ image mosaics, and
// text-only posts take a full row; single/two-image posts pair up. A lone
// half-width card (wide item next or list ends) is promoted to full width so
// no column is ever left empty — grid order is preserved.
function rowSpans(posts: PostCardData[]) {
  const items = posts.map((post) => {
    const imageCount = post.sharedPost ? post.sharedPost.imageUrls.length : post.images.length
    const video = post.sharedPost ? post.sharedPost.video : post.video
    return { post, wide: imageCount === 0 || imageCount >= 3 || !!video }
  })

  for (let i = 0; i < items.length; i++) {
    if (items[i].wide) continue
    const next = items[i + 1]
    if (next && !next.wide) i++
    else items[i].wide = true
  }
  return items
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rowSpans(posts).map(({ post, wide }) => (
            <div key={post.id} className={wide ? 'lg:col-span-2' : ''}>
              <ExplorePostCard post={post} wide={wide} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

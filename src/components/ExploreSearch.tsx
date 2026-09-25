'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { searchPosts } from '@/actions/posts'
import { searchUsers } from '@/actions/users'
import type { PostCardData, UserCardData } from '@/lib/serialize'

import { EmptyState } from './EmptyState'
import { ExplorePostCard } from './ExplorePostCard'
import { ListIcon, SearchIcon, UsersIcon } from './icons'
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
      <h1 className="text-3xl font-bold tracking-tight">Explore</h1>
      <p className="mb-4 mt-1 text-sm text-neutral-500">
        See what&rsquo;s trending in the community.
      </p>

      {query ? (
        <p className="text-sm text-neutral-500">
          Results for <span className="font-semibold text-neutral-800">“{query}”</span>
        </p>
      ) : null}

      {/* Trending hashtag chips — hidden while searching */}
      {!query && trendingTags.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400">Trending</p>
          <div className="flex flex-wrap gap-1.5">
            {trendingTags.map((tag) => (
              <Link
                key={tag}
                href={`/explore?q=${encodeURIComponent(tag)}`}
                className="rounded-full bg-black/5 px-3 py-1 text-[13px] text-neutral-600 transition-colors hover:bg-emerald-500/15 hover:text-emerald-800"
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
          {posts.map((post) => (
            <ExplorePostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </>
  )
}

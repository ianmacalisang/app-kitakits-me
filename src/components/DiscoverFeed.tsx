'use client'

import { useState, useTransition } from 'react'

import { getDiscoverPosts } from '@/actions/discover'
import type { PostCategory } from '@/lib/categories'
import type { PostCardData } from '@/lib/serialize'

import { EmptyState } from './EmptyState'
import { ListIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { PostCard } from './PostCard'

// Paginated feed for a single Discover category — full-size post cards in a
// single column, like the home feed. Cards link to public @handle profiles.
export function DiscoverFeed({
  category,
  initialPosts,
  initialHasMore,
}: {
  category: PostCategory | 'all'
  initialPosts: PostCardData[]
  initialHasMore: boolean
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, startTransition] = useTransition()

  const loadMore = () => {
    if (pending) return
    const next = page + 1
    startTransition(async () => {
      const result = await getDiscoverPosts(category, next)
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...result.items.filter((p) => !seen.has(p.id))]
      })
      setPage(next)
      setHasMore(result.hasMore)
    })
  }

  return (
    <>
      {posts.length === 0 ? (
        <EmptyState
          icon={<ListIcon />}
          title="No posts yet"
          message="Nothing public in this category — check back soon."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} isPublicPage />
          ))}
        </div>
      )}
      <LoadSentinel hasMore={hasMore} pending={pending} onLoadAction={loadMore} />
    </>
  )
}

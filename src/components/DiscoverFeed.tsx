'use client'

import { useState, useTransition } from 'react'

import { getDiscoverPosts } from '@/actions/discover'
import type { PostCategory } from '@/lib/categories'
import type { PostCardData } from '@/lib/serialize'

import { DiscoverPostCard } from './DiscoverPostCard'
import { EmptyState } from './EmptyState'
import { ListIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'

// Paginated feed for a single Discover category — content-only public cards
// (reel / photo / quote by media type) in a single column. Author links go to
// the public @handle pages.
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
          message={
            category === 'all'
              ? 'Nothing public yet — check back soon.'
              : 'Nothing public in this category — check back soon.'
          }
        />
      ) : (
        // Masonry — CSS columns; cards stay whole via break-inside-avoid
        // and order flows down each column. The sentinel stays outside so
        // it isn't laid out as a masonry item.
        <div className="columns-1 gap-4 sm:columns-2">
          {posts.map((post) => (
            <div key={post.id} className="mb-4 break-inside-avoid">
              <DiscoverPostCard post={post} />
            </div>
          ))}
        </div>
      )}
      <LoadSentinel hasMore={hasMore} pending={pending} onLoadAction={loadMore} />
    </>
  )
}

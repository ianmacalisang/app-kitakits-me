'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { getDiscoverPosts } from '@/actions/discover'
import { getPost } from '@/actions/posts'
import type { PostCategory } from '@/lib/categories'
import {
  LIVE_EVENT,
  POST_DELETED,
  POST_UPDATED,
  type LiveEventDetail,
  type PostDeletedDetail,
  type PostUpdatedDetail,
} from '@/lib/events'
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
  const [prevInitial, setPrevInitial] = useState(initialPosts)
  const postsRef = useRef(posts)

  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  // Reconcile when the server re-renders the list (e.g. a badge-driven
  // router.refresh()): keep pages loaded via infinite scroll if the refreshed
  // first page still matches.
  if (prevInitial !== initialPosts) {
    setPrevInitial(initialPosts)
    const sameHead =
      initialPosts.length > 0 &&
      posts.length >= initialPosts.length &&
      initialPosts.every((p, i) => posts[i].id === p.id)
    if (sameHead) {
      setPosts([...initialPosts, ...posts.slice(initialPosts.length)])
    } else {
      setPosts(initialPosts)
      setPage(1)
      setHasMore(initialHasMore)
    }
  }

  // Mount reconcile — back-navigation can remount this feed from the router
  // cache with stale data; one page-1 fetch refreshes the head while keeping
  // loaded pages attached below the fresh tail (same merge as Feed).
  useEffect(() => {
    let cancelled = false
    void getDiscoverPosts(category, 1).then((result) => {
      if (cancelled) return
      const freshIds = new Set(result.items.map((p) => p.id))
      const tail = result.items[result.items.length - 1]
      const kept = tail
        ? postsRef.current.filter(
            (p) =>
              !freshIds.has(p.id) &&
              (p.createdAt < tail.createdAt || (p.createdAt === tail.createdAt && p.id < tail.id)),
          )
        : []
      setPosts([...result.items, ...kept])
      if (kept.length === 0) {
        setPage(1)
        setHasMore(result.hasMore)
      }
    })
    return () => {
      cancelled = true
    }
  }, [category])

  // Deletes/edits anywhere in the app (this tab or a socket push) drop or
  // patch the card — including masonry items past the first page.
  useEffect(() => {
    const removePost = (postId: number) =>
      setPosts((prev) => prev.filter((p) => p.id !== postId && p.sharedPost?.id !== postId))
    const applyUpdated = (updated: PostCardData) => {
      // Discover only shows public originals — an edit that restricts
      // visibility or turns the post into a share-card drops it.
      const belongs = updated.visibility === 'public' && !updated.sharedPost
      setPosts((prev) =>
        prev.flatMap((p) => {
          if (p.id === updated.id) return belongs ? [updated] : []
          if (p.sharedPost?.id === updated.id) {
            return [
              {
                ...p,
                sharedPost: {
                  ...p.sharedPost,
                  content: updated.content,
                  imageUrls: updated.images.map((i) => i.url),
                  video: updated.video,
                  category: updated.category ?? 'kwento',
                },
              },
            ]
          }
          return [p]
        }),
      )
    }
    const onDeleted = (e: Event) => removePost((e as CustomEvent<PostDeletedDetail>).detail.postId)
    const onUpdated = (e: Event) => applyUpdated((e as CustomEvent<PostUpdatedDetail>).detail.post)
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveEventDetail>).detail
      if (detail?.type === 'feed:delete') removePost(detail.postId)
      else if (detail?.type === 'feed:update') {
        if (
          !postsRef.current.some(
            (p) => p.id === detail.postId || p.sharedPost?.id === detail.postId,
          )
        )
          return
        void getPost(detail.postId).then((post) => {
          if (post) applyUpdated(post)
          else removePost(detail.postId)
        })
      }
    }
    window.addEventListener(POST_DELETED, onDeleted)
    window.addEventListener(POST_UPDATED, onUpdated)
    window.addEventListener(LIVE_EVENT, onLive)
    return () => {
      window.removeEventListener(POST_DELETED, onDeleted)
      window.removeEventListener(POST_UPDATED, onUpdated)
      window.removeEventListener(LIVE_EVENT, onLive)
    }
  }, [])

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

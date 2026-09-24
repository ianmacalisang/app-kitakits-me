'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'

import { getPost, loadMorePosts } from '@/actions/posts'
import { POST_SAVE_TOGGLED, type PostSaveToggledDetail } from '@/lib/events'
import type { PostCardData } from '@/lib/serialize'

import { EmptyState } from './EmptyState'
import { ListIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { PostCard } from './PostCard'

export function Feed({
  initialPosts,
  initialHasMore,
  authorId,
  emptyIcon = <ListIcon />,
  emptyTitle = 'No posts yet',
  emptyMessage,
  emptyAction,
  timeline = false,
  feed,
  seed: seedProp,
}: {
  initialPosts: PostCardData[]
  initialHasMore: boolean
  authorId?: number
  emptyIcon?: ReactNode
  emptyTitle?: ReactNode
  emptyMessage?: ReactNode
  emptyAction?: ReactNode
  timeline?: boolean
  feed?: 'foryou' | 'following' | 'saved'
  seed?: number
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(1)
  const [pending, startTransition] = useTransition()
  const [prevInitial, setPrevInitial] = useState(initialPosts)
  // Seed for the For You shuffle — stable for the life of this feed so pages
  // stay consistent with the server-rendered first page. Generated lazily in
  // loadMore when the server didn't provide one (Math.random can't run during
  // render).
  const seedRef = useRef(seedProp)

  // When the server data changes (e.g. after router.refresh()), reconcile: if the
  // refreshed first page matches what we already show, swap in the fresh page but
  // keep pages loaded via infinite scroll. Otherwise reset pagination state.
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
      setHasMore(initialHasMore)
      setPage(1)
    }
  }

  const loadMore = useCallback(() => {
    if (pending) return
    startTransition(async () => {
      const next = page + 1
      seedRef.current ??= Math.floor(Math.random() * 0x7fffffff)
      const result = await loadMorePosts({ page: next, authorId, feed, seed: seedRef.current })
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...result.posts.filter((p) => !seen.has(p.id))]
      })
      setHasMore(result.hasMore)
      setPage(next)
    })
  }, [pending, page, authorId, feed])

  // Saved feed only: keep the list in sync with bookmark toggles on any post
  // card — newly saved posts are prepended (most-recent-first order), unsaved
  // posts drop out. When the last visible card is unsaved but more pages
  // exist, pull the next one in.
  useEffect(() => {
    if (feed !== 'saved') return
    const onToggled = (event: Event) => {
      const { postId, saved } = (event as CustomEvent<PostSaveToggledDetail>).detail
      if (saved) {
        void getPost(postId).then((post) => {
          if (!post) return
          setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]))
        })
      } else {
        setPosts((prev) => prev.filter((p) => p.id !== postId))
        if (posts.length === 1 && posts[0]?.id === postId && hasMore) loadMore()
      }
    }
    window.addEventListener(POST_SAVE_TOGGLED, onToggled)
    return () => window.removeEventListener(POST_SAVE_TOGGLED, onToggled)
  }, [feed, posts, hasMore, loadMore])

  if (posts.length === 0) {
    return (
      <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage}>
        {emptyAction}
      </EmptyState>
    )
  }

  if (!timeline) {
    return (
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        <LoadSentinel hasMore={hasMore} pending={pending} onLoadAction={loadMore} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col">
        {posts.map((post, i) => {
          const date = new Date(post.createdAt)
          const prev = i > 0 ? new Date(posts[i - 1].createdAt) : null
          const sameDay =
            prev !== null &&
            prev.getFullYear() === date.getFullYear() &&
            prev.getMonth() === date.getMonth() &&
            prev.getDate() === date.getDate()
          const showYear = !prev || prev.getFullYear() !== date.getFullYear()
          const isFirst = i === 0
          const isLast = i === posts.length - 1
          return (
            <div key={post.id} className="flex">
              <div className="w-11 shrink-0 pt-4 text-right">
                {!sameDay && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </p>
                    <p className="text-sm font-semibold leading-tight text-neutral-600">
                      {date.getDate()}
                    </p>
                    {showYear && (
                      <p className="mt-0.5 text-[10px] font-medium text-neutral-400">
                        {date.getFullYear()}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="relative mx-3 w-2.5 shrink-0">
                <span
                  aria-hidden
                  className={`absolute left-1/2 w-px -translate-x-1/2 bg-neutral-300/80 ${
                    isFirst && isLast
                      ? 'hidden'
                      : isLast
                        ? 'top-0 h-[31px]'
                        : isFirst
                          ? 'bottom-0 top-[26px]'
                          : 'inset-y-0'
                  }`}
                />
                <span
                  aria-hidden
                  className="absolute left-1/2 top-[26px] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-emerald-500"
                />
              </div>
              <div className="min-w-0 flex-1 pb-4">
                <PostCard post={post} />
              </div>
            </div>
          )
        })}
      </div>
      <LoadSentinel hasMore={hasMore} pending={pending} onLoadAction={loadMore} />
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'

import { getPost, loadMorePosts } from '@/actions/posts'
import { POST_SAVE_TOGGLED, type PostSaveToggledDetail } from '@/lib/events'
import type { MediaFilter, PostCardData } from '@/lib/serialize'

import { EmptyState } from './EmptyState'
import { CheckIcon, ChevronDownIcon, ImageIcon, ListIcon, VideoIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { PhotoPost } from './PhotoPost'
import { PostCard } from './PostCard'
import { ReelPost } from './ReelPost'
import { Spinner } from './Spinner'

const MEDIA_FILTERS: {
  value: MediaFilter
  label: string
  hint: string
  icon: typeof ListIcon
}[] = [
  { value: 'all', label: 'All', hint: 'Every post, classic feed', icon: ListIcon },
  { value: 'images', label: 'Photos', hint: 'Gallery style photo feed', icon: ImageIcon },
  { value: 'videos', label: 'Videos', hint: 'Reels style video feed', icon: VideoIcon },
]

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
  filterable = false,
  initialMediaFilter = 'all',
}: {
  initialPosts: PostCardData[]
  initialHasMore: boolean
  authorId?: number
  emptyIcon?: ReactNode
  emptyTitle?: ReactNode
  emptyMessage?: ReactNode
  emptyAction?: ReactNode
  timeline?: boolean
  feed?: 'following' | 'saved'
  filterable?: boolean
  // Server-applied media filter — the page reads ?media= so the first paint
  // is already filtered (no client flash of the All layout).
  initialMediaFilter?: MediaFilter
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(1)
  const [pending, startTransition] = useTransition()
  const [prevInitial, setPrevInitial] = useState(initialPosts)
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(initialMediaFilter)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const filterRestoredRef = useRef(false)
  const [resetNonce, setResetNonce] = useState(0)

  // Media filter persists in the URL (?media=videos) so refreshes and
  // shared links keep it. The page applies it server-side, so this only
  // refetches when the URL disagrees with what SSR shipped.
  const urlMediaFilter = (): MediaFilter => {
    const v = new URLSearchParams(window.location.search).get('media')
    return MEDIA_FILTERS.some((f) => f.value === v) ? (v as MediaFilter) : 'all'
  }

  const refetchPageOne = useCallback(
    (next: MediaFilter) => {
      startTransition(async () => {
        const result = await loadMorePosts({ page: 1, authorId, feed, mediaFilter: next })
        setPosts(result.posts)
        setHasMore(result.hasMore)
        setPage(1)
      })
    },
    [authorId, feed],
  )

  useEffect(() => {
    if (!filterable || filterRestoredRef.current) return
    filterRestoredRef.current = true
    const next = urlMediaFilter()
    if (next === initialMediaFilter) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing state with the URL param read on mount
    setMediaFilter(next)
    refetchPageOne(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only URL restoration; initialMediaFilter is the SSR baseline
  }, [filterable, refetchPageOne])

  // After a server refresh resets the list to the unfiltered first page,
  // re-apply the URL filter instead of silently dropping it.
  useEffect(() => {
    if (!filterable || resetNonce === 0) return
    const next = urlMediaFilter()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-syncing state with the URL param after a server refresh
    setMediaFilter(next)
    if (next !== 'all') refetchPageOne(next)
  }, [resetNonce, filterable, refetchPageOne])

  // Close the filter dropdown on outside click (same pattern as AppNav).
  useEffect(() => {
    if (!filterOpen) return
    const close = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [filterOpen])

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
      setResetNonce((n) => n + 1)
    }
  }

  const loadMore = useCallback(() => {
    if (pending) return
    startTransition(async () => {
      const next = page + 1
      const result = await loadMorePosts({ page: next, authorId, feed, mediaFilter })
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...result.posts.filter((p) => !seen.has(p.id))]
      })
      setHasMore(result.hasMore)
      setPage(next)
    })
  }, [pending, page, authorId, feed, mediaFilter])

  // Switching filters refetches page 1 with the new media constraint and
  // resets infinite-scroll state.
  const applyMediaFilter = (next: MediaFilter) => {
    if (next === mediaFilter || pending) return
    setMediaFilter(next)
    const params = new URLSearchParams(window.location.search)
    if (next === 'all') params.delete('media')
    else params.set('media', next)
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    setPosts([]) // clear the view — a loader shows while the refetch runs
    refetchPageOne(next)
  }

  const activeFilter = MEDIA_FILTERS.find((f) => f.value === mediaFilter) ?? MEDIA_FILTERS[0]
  const ActiveFilterIcon = activeFilter.icon
  const filterBar = filterable ? (
    <div className="mb-3 flex justify-end">
      <div className="relative" ref={filterRef}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((open) => !open)}
          className="glass flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2.5 text-xs font-semibold text-neutral-600 transition-all hover:text-neutral-800 active:scale-[0.97]"
        >
          <ActiveFilterIcon className="h-3.5 w-3.5 text-accent-600" />
          {activeFilter.label}
          <ChevronDownIcon
            className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ${
              filterOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
        {filterOpen && (
          <div
            role="listbox"
            aria-label="Filter posts by media"
            className="glass-pop motion-safe:animate-menu-pop absolute right-0 top-full z-20 mt-2 w-56 origin-top-right rounded-2xl p-1.5"
          >
            <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Filter
            </p>
            {MEDIA_FILTERS.map(({ value, label, hint, icon: Icon }) => {
              const active = mediaFilter === value
              return (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setFilterOpen(false)
                    applyMediaFilter(value)
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'bg-accent-500/10 text-accent-700'
                      : 'text-neutral-600 hover:bg-white/70'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{label}</span>
                    <span
                      className={`block text-[11px] leading-tight ${
                        active ? 'text-accent-600/80' : 'text-neutral-400'
                      }`}
                    >
                      {hint}
                    </span>
                  </span>
                  {active && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  ) : null

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
      <>
        {filterBar}
        {pending ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage}>
            {emptyAction}
          </EmptyState>
        )}
      </>
    )
  }

  if (!timeline) {
    return (
      <div>
        {filterBar}
        {/* Photos → Instagram-feed-style cards; Videos → reels-style tall
            cards. A post whose media lives on the embedded share falls back
            to the normal card. */}
        <div className={`transition-opacity ${pending ? 'opacity-60' : ''}`}>
          <div className={`flex flex-col ${mediaFilter === 'videos' ? 'gap-4' : 'gap-3'}`}>
            {posts.map((post) =>
              mediaFilter === 'videos' && post.video ? (
                <ReelPost key={post.id} post={post} />
              ) : mediaFilter === 'images' && post.images.length > 0 ? (
                <PhotoPost key={post.id} post={post} />
              ) : (
                <PostCard key={post.id} post={post} />
              ),
            )}
          </div>
          <LoadSentinel hasMore={hasMore} pending={pending} onLoadAction={loadMore} />
        </div>
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
                  className="absolute left-1/2 top-[26px] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-accent-500"
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

'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'

import { getNewerPosts, getPost, loadMorePosts } from '@/actions/posts'
import {
  CATEGORY_TINTS,
  POST_CATEGORIES,
  type PostCategory,
  isPostCategory,
  postCategory,
} from '@/lib/categories'
import {
  LIVE_EVENT,
  POST_SAVE_TOGGLED,
  type LiveEventDetail,
  type PostSaveToggledDetail,
} from '@/lib/events'
import type { MediaFilter, PostCardData } from '@/lib/serialize'

import { CATEGORY_ICONS } from './CategoryChip'
import { EmptyState } from './EmptyState'
import { CheckIcon, ChevronDownIcon, FilterIcon, ImageIcon, ListIcon, VideoIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { PhotoPost } from './PhotoPost'
import { PostCard } from './PostCard'
import { ReelPost } from './ReelPost'
import { Spinner } from './Spinner'

type CategoryFilter = PostCategory | 'all'

// Live feed — new posts arrive instantly via the pushed 'feed:new' event;
// the interval is only a fallback for a dead/missing socket. AT_TOP_PX is
// how near the top counts as "at the top" for auto-prepending.
const LIVE_POLL_MS = 120_000
const AT_TOP_PX = 48

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
  initialCategory = 'all',
  live = false,
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
  // Same, for ?category= — the page filters by post category server-side.
  initialCategory?: CategoryFilter
  // Poll for posts newer than the feed's head — they auto-prepend at the
  // top, or queue behind a "new posts" pill while scrolled down.
  live?: boolean
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(1)
  const [pending, startTransition] = useTransition()
  const [prevInitial, setPrevInitial] = useState(initialPosts)
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(initialMediaFilter)
  const [category, setCategory] = useState<CategoryFilter>(initialCategory)
  const [filterOpen, setFilterOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)
  const filterRestoredRef = useRef(false)
  const [resetNonce, setResetNonce] = useState(0)

  // New posts fetched in the background but not yet inserted — they sit
  // behind the pill until the user taps it or scrolls back to the top.
  const [pendingNew, setPendingNew] = useState<PostCardData[]>([])
  // Refs give the poller/scroll callbacks the latest values without
  // re-subscribing on every posts change.
  const postsRef = useRef(posts)
  const pendingNewRef = useRef<PostCardData[]>([])

  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  useEffect(() => {
    pendingNewRef.current = pendingNew
  }, [pendingNew])

  // Media filter persists in the URL (?media=videos) so refreshes and
  // shared links keep it. The page applies it server-side, so this only
  // refetches when the URL disagrees with what SSR shipped.
  const urlMediaFilter = (): MediaFilter => {
    const v = new URLSearchParams(window.location.search).get('media')
    return MEDIA_FILTERS.some((f) => f.value === v) ? (v as MediaFilter) : 'all'
  }

  const urlCategory = (): CategoryFilter => {
    const v = new URLSearchParams(window.location.search).get('category')
    return isPostCategory(v) ? v : 'all'
  }

  const refetchPageOne = useCallback(
    (nextMedia: MediaFilter, nextCategory: CategoryFilter) => {
      pendingNewRef.current = []
      setPendingNew([])
      startTransition(async () => {
        const result = await loadMorePosts({
          page: 1,
          authorId,
          feed,
          mediaFilter: nextMedia,
          category: nextCategory,
        })
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
    const nextMedia = urlMediaFilter()
    const nextCategory = urlCategory()
    if (nextMedia === initialMediaFilter && nextCategory === initialCategory) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing state with the URL param read on mount
    setMediaFilter(nextMedia)
    setCategory(nextCategory)
    refetchPageOne(nextMedia, nextCategory)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only URL restoration; SSR values are the baseline
  }, [filterable, refetchPageOne])

  // After a server refresh resets the list to the unfiltered first page,
  // re-apply the URL filter instead of silently dropping it.
  useEffect(() => {
    if (!filterable || resetNonce === 0) return
    const nextMedia = urlMediaFilter()
    const nextCategory = urlCategory()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-syncing state with the URL param after a server refresh
    setMediaFilter(nextMedia)
    setCategory(nextCategory)
    if (nextMedia !== 'all' || nextCategory !== 'all') refetchPageOne(nextMedia, nextCategory)
  }, [resetNonce, filterable, refetchPageOne])

  // Close the filter dropdowns on outside click (same pattern as AppNav).
  useEffect(() => {
    if (!filterOpen && !categoryOpen) return
    const close = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false)
      if (!categoryRef.current?.contains(e.target as Node)) setCategoryOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [filterOpen, categoryOpen])

  // When the server data changes (e.g. after router.refresh()), reconcile: if the
  // refreshed first page matches what we already show, swap in the fresh page but
  // keep pages loaded via infinite scroll. Otherwise reset pagination state.
  if (prevInitial !== initialPosts) {
    setPrevInitial(initialPosts)
    // Refreshed server data may already contain the queued posts — the ref
    // re-syncs from state in the effect above.
    setPendingNew([])
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
      const result = await loadMorePosts({ page: next, authorId, feed, mediaFilter, category })
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...result.posts.filter((p) => !seen.has(p.id))]
      })
      setHasMore(result.hasMore)
      setPage(next)
    })
  }, [pending, page, authorId, feed, mediaFilter, category])

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
    refetchPageOne(next, category)
  }

  // Category chips — same URL-persist + refetch flow as the media filter.
  const applyCategory = (next: CategoryFilter) => {
    if (next === category || pending) return
    setCategory(next)
    const params = new URLSearchParams(window.location.search)
    if (next === 'all') params.delete('category')
    else params.set('category', next)
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    setPosts([])
    refetchPageOne(mediaFilter, next)
  }

  const activeFilter = MEDIA_FILTERS.find((f) => f.value === mediaFilter) ?? MEDIA_FILTERS[0]
  const ActiveFilterIcon = activeFilter.icon
  const activeCategory = category === 'all' ? undefined : postCategory(category)
  const ActiveCategoryIcon = activeCategory ? CATEGORY_ICONS[activeCategory.icon] : FilterIcon
  const filterBar = filterable ? (
    <div className="mb-3 flex items-center justify-between gap-2">
      {/* Category dropdown — left side of the media filter. */}
      <div className="relative" ref={categoryRef}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={categoryOpen}
          onClick={() => setCategoryOpen((open) => !open)}
          className="glass flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2.5 text-xs font-semibold text-neutral-600 transition-all hover:text-neutral-800 active:scale-[0.97]"
        >
          <ActiveCategoryIcon
            className={`h-3.5 w-3.5 ${
              activeCategory ? CATEGORY_TINTS[activeCategory.tint].icon : 'text-accent-600'
            }`}
          />
          {activeCategory?.label ?? 'Category'}
          <ChevronDownIcon
            className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ${
              categoryOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
        {categoryOpen && (
          <div
            role="listbox"
            aria-label="Filter posts by category"
            className="glass-pop motion-safe:animate-menu-pop absolute left-0 top-full z-20 mt-2 w-48 origin-top-left rounded-2xl p-1.5"
          >
            <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Category
            </p>
            <button
              type="button"
              role="option"
              aria-selected={category === 'all'}
              onClick={() => {
                setCategoryOpen(false)
                applyCategory('all')
              }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                category === 'all'
                  ? 'bg-accent-500/10 text-accent-700'
                  : 'text-neutral-600 hover:bg-white/70'
              }`}
            >
              <FilterIcon className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="min-w-0 flex-1">All</span>
              {category === 'all' && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
            </button>
            {POST_CATEGORIES.map((c) => {
              const active = category === c.value
              const Icon = CATEGORY_ICONS[c.icon]
              return (
                <button
                  key={c.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setCategoryOpen(false)
                    applyCategory(c.value)
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-accent-500/10 text-accent-700'
                      : 'text-neutral-600 hover:bg-white/70'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${CATEGORY_TINTS[c.tint].icon}`} />
                  <span className="min-w-0 flex-1">{c.label}</span>
                  {active && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
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

  // Insert the queued posts at the head — called from the pill and when the
  // user scrolls back to the top while the pill is up.
  const flushNew = useCallback(() => {
    const pending = pendingNewRef.current
    if (pending.length === 0) return
    pendingNewRef.current = []
    setPendingNew([])
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id))
      return [...pending.filter((p) => !seen.has(p.id)), ...prev]
    })
  }, [])

  // Live updates — 'feed:new' pushes trigger an immediate fetch of posts
  // newer than the head; the slow interval is a fallback for a dead socket.
  // Near the top they prepend silently; scrolled down they queue behind the
  // pill. Skips while the tab is hidden (same pattern as the AppNav poller).
  useEffect(() => {
    if (!live || posts.length === 0) return

    let inFlight = false
    const tick = async () => {
      if (inFlight || document.hidden) return
      const head = postsRef.current[0]
      if (!head) return
      inFlight = true
      try {
        const result = await getNewerPosts({
          afterId: head.id,
          afterCreatedAt: head.createdAt,
          authorId,
          feed,
          mediaFilter,
          category,
        })
        const seen = new Set([
          ...postsRef.current.map((p) => p.id),
          ...pendingNewRef.current.map((p) => p.id),
        ])
        const incoming = result.posts.filter((p) => !seen.has(p.id))
        if (incoming.length === 0) return
        if (window.scrollY <= AT_TOP_PX) {
          // Flush any queued (older) posts first so the head stays newest-first.
          flushNew()
          setPosts((prev) => {
            const ids = new Set(prev.map((p) => p.id))
            return [...incoming.filter((p) => !ids.has(p.id)), ...prev]
          })
        } else {
          pendingNewRef.current = [...pendingNewRef.current, ...incoming]
          setPendingNew(pendingNewRef.current)
        }
      } finally {
        inFlight = false
      }
    }

    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveEventDetail>).detail
      if (detail?.type !== 'feed:new') return
      // Profile feeds only care about that author's posts; the following
      // feed is already scoped by the push (followers only).
      if (authorId && detail.authorId !== authorId) return
      void tick()
    }
    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    const timer = setInterval(() => void tick(), LIVE_POLL_MS)
    window.addEventListener(LIVE_EVENT, onLive)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener(LIVE_EVENT, onLive)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [live, posts.length, authorId, feed, mediaFilter, category, flushNew])

  // Scrolling back to the top flushes the queued posts — the pill is only
  // meant for while the head of the feed is out of view.
  useEffect(() => {
    if (!live || pendingNew.length === 0) return
    const onScroll = () => {
      if (window.scrollY <= AT_TOP_PX) flushNew()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [live, pendingNew.length, flushNew])

  const showNewPosts = () => {
    flushNew()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const newPostsPill =
    live && pendingNew.length > 0 ? (
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4"
      >
        <button
          type="button"
          onClick={showNewPosts}
          className="btn-primary motion-safe:animate-toast-in pointer-events-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-sm"
        >
          <ChevronDownIcon className="h-4 w-4 rotate-180" />
          {pendingNew.length === 1 ? '1 new post' : `${pendingNew.length} new posts`}
        </button>
      </div>
    ) : null

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
        {newPostsPill}
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
      {newPostsPill}
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

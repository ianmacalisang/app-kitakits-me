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
  POST_DELETED,
  POST_SAVE_TOGGLED,
  POST_UPDATED,
  type LiveEventDetail,
  type PostDeletedDetail,
  type PostSaveToggledDetail,
  type PostUpdatedDetail,
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

  // Full head reconcile — refetches page 1 with the active filters and merges
  // it over the loaded window: fresh data replaces matching posts (edits),
  // posts missing from the window drop out (deletes, lost access, unfollows),
  // and infinite-scroll pages below the fresh tail stay attached. Runs on the
  // fallback poll, on tab-return, and on mount — a back-navigation remount can
  // resurrect a cached render up to ~30s old (staleTimes.dynamic).
  //
  // Time-ordered feeds use the (createdAt, id) cursor of the fresh page's
  // last item as the window boundary — loaded posts older than it are beyond
  // page 1 by definition. The saved feed is ordered by save time, so it
  // reconciles by position instead: loaded items up to the deepest one still
  // present in the fresh page are window-covered, anything deeper is kept.
  const reconcileHead = useCallback(async () => {
    const result = await loadMorePosts({
      page: 1,
      authorId,
      feed,
      // The URL is the filter source of truth — state can lag a restore.
      mediaFilter: filterable ? urlMediaFilter() : mediaFilter,
      category: filterable ? urlCategory() : category,
    })
    const freshIds = new Set(result.posts.map((p) => p.id))
    let kept: PostCardData[]
    if (feed === 'saved') {
      const lastFreshIdx = postsRef.current.reduce(
        (acc, p, i) => (freshIds.has(p.id) ? i : acc),
        -1,
      )
      kept =
        result.posts.length === 0
          ? []
          : postsRef.current.slice(lastFreshIdx + 1).filter((p) => !freshIds.has(p.id))
    } else {
      const tail = result.posts[result.posts.length - 1]
      kept = tail
        ? postsRef.current.filter(
            (p) =>
              !freshIds.has(p.id) &&
              (p.createdAt < tail.createdAt || (p.createdAt === tail.createdAt && p.id < tail.id)),
          )
        : []
    }
    setPosts([...result.posts, ...kept])
    if (kept.length === 0) {
      setPage(1)
      setHasMore(result.hasMore)
    }
    // Queued "new posts" are inside the fresh page now — drop covered ids.
    pendingNewRef.current = pendingNewRef.current.filter((p) => !freshIds.has(p.id))
    setPendingNew(pendingNewRef.current)
  }, [authorId, feed, mediaFilter, category, filterable])

  // Mount reconcile — SPA back-navigation can remount this feed from the
  // router cache with stale data; one page-1 fetch brings it current. On a
  // true first mount it's a redundant-but-harmless refetch.
  useEffect(() => {
    if (!document.hidden) void reconcileHead()
  }, [reconcileHead])

  // A post vanished — drop it (and share-cards embedding it) from the list
  // and from the queued "new posts" buffer. Backfills once if the visible
  // list collapsed while more pages exist.
  const removePost = useCallback(
    (postId: number) => {
      const matches = (p: PostCardData) => p.id === postId || p.sharedPost?.id === postId
      if (pendingNewRef.current.some(matches)) {
        pendingNewRef.current = pendingNewRef.current.filter((p) => !matches(p))
        setPendingNew(pendingNewRef.current)
      }
      if (!postsRef.current.some(matches)) return
      const next = postsRef.current.filter((p) => !matches(p))
      setPosts(next)
      if (next.length === 0 && hasMore) void loadMore()
    },
    [hasMore, loadMore],
  )

  // Edited post data patches in place — the card is dropped when it no
  // longer matches the active media/category filters. Share-cards carrying
  // the post as their embed get the embedded fields refreshed too.
  const applyUpdated = useCallback(
    (updated: PostCardData) => {
      const matchesFilters =
        (category === 'all' || (updated.category ?? 'kwento') === category) &&
        (mediaFilter === 'all' ||
          (mediaFilter === 'media' && (updated.images.length > 0 || Boolean(updated.video))) ||
          (mediaFilter === 'images' && updated.images.length > 0) ||
          (mediaFilter === 'videos' && Boolean(updated.video)))
      pendingNewRef.current = pendingNewRef.current.flatMap((p) =>
        p.id === updated.id ? (matchesFilters ? [updated] : []) : [p],
      )
      setPendingNew(pendingNewRef.current)
      setPosts((prev) =>
        prev.flatMap((p) => {
          if (p.id === updated.id) return matchesFilters ? [updated] : []
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
    },
    [category, mediaFilter],
  )

  // Cross-component sync — deletes/edits anywhere in the app (this tab's own
  // actions or a socket push from another session) patch every mounted feed,
  // including infinite-scroll pages the router.refresh() reconcile can't
  // reach. Not gated on `live`: the saved tab and profile feeds sync too.
  useEffect(() => {
    const onDeleted = (e: Event) => removePost((e as CustomEvent<PostDeletedDetail>).detail.postId)
    const onUpdated = (e: Event) => applyUpdated((e as CustomEvent<PostUpdatedDetail>).detail.post)
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveEventDetail>).detail
      if (detail?.type === 'feed:delete') {
        removePost(detail.postId)
      } else if (detail?.type === 'feed:update') {
        const inList =
          postsRef.current.some(
            (p) => p.id === detail.postId || p.sharedPost?.id === detail.postId,
          ) || pendingNewRef.current.some((p) => p.id === detail.postId)
        if (!inList) return
        // Null means deleted or no longer readable (e.g. went followers-only).
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
  }, [removePost, applyUpdated])

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
  // newer than the head; the interval and tab-return do a full head reconcile
  // so deletes/edits that slipped through land too. Near the top new posts
  // prepend silently; scrolled down they queue behind the pill. An empty
  // feed has no cursor to diff against — it reconciles instead, which is how
  // it comes alive. Skips while the tab is hidden (same pattern as the
  // AppNav poller).
  useEffect(() => {
    if (!live) return

    let inFlight = false
    const tick = async () => {
      if (inFlight || document.hidden) return
      const head = postsRef.current[0]
      if (!head) {
        inFlight = true
        try {
          await reconcileHead()
        } finally {
          inFlight = false
        }
        return
      }
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
    const reconcile = async () => {
      if (inFlight || document.hidden) return
      inFlight = true
      try {
        await reconcileHead()
      } finally {
        inFlight = false
      }
    }
    const onVisible = () => {
      if (!document.hidden) void reconcile()
    }
    const timer = setInterval(() => void reconcile(), LIVE_POLL_MS)
    window.addEventListener(LIVE_EVENT, onLive)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener(LIVE_EVENT, onLive)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [live, authorId, feed, mediaFilter, category, flushNew, reconcileHead])

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

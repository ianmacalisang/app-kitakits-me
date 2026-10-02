'use client'

import { useRouter } from 'next/navigation'
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'

import { getActivitiesFingerprint, loadMoreActivities } from '@/actions/activities'
import type { ActivityData, Paged } from '@/lib/serialize'

import { ActivityListSkeleton } from './ActivityListSkeleton'
import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { BadgeSheet } from './BadgeSheet'
import { CommentsSheet } from './CommentsSheet'
import { EmptyState } from './EmptyState'
import { HomeTabContext } from './HomeTabContext'
import {
  ActivityIcon,
  ChevronRightIcon,
  CommentIcon,
  EyeIcon,
  GripIcon,
  HeartIcon,
  MedalIcon,
  QuoteIcon,
  UserIcon,
} from './icons'
import { LoadSentinel } from './LoadSentinel'
import { PostCard } from './PostCard'
import { PostSheet } from './PostSheet'
import { RelativeTime } from './RelativeTime'

const typeIcon = {
  like: <HeartIcon className="h-3 w-3" filled />,
  comment: <CommentIcon className="h-3.5 w-3.5" />,
  follow: <UserIcon className="h-3.5 w-3.5" />,
  testimonial: <QuoteIcon className="h-3.5 w-3.5" />,
  badge: <MedalIcon className="h-3.5 w-3.5" />,
  profile_view: <EyeIcon className="h-3.5 w-3.5" />,
  hangout_join: <GripIcon className="h-3.5 w-3.5" />,
}

const typeColor = {
  like: 'bg-rose-500 text-white',
  comment: 'bg-accent-500 text-white',
  follow: 'bg-accent-500 text-white',
  testimonial: 'bg-violet-500 text-white',
  badge: 'bg-amber-500 text-white',
  profile_view: 'bg-sky-500 text-white',
  hangout_join: 'bg-violet-500 text-white',
}

// "Maria liked Juan's post" — actor and target names in semibold, the verb plain.
const ActivityText = ({ activity }: { activity: ActivityData }) => {
  const actor = (
    <>
      <span className="font-semibold">{activity.actorName}</span>{' '}
      <BadgeMark badge={activity.actorBadge} className="h-3.5 w-3.5" />
    </>
  )
  const postAuthor = activity.postAuthorName ? (
    <>
      <span className="font-semibold">{activity.postAuthorName}</span>{' '}
      <BadgeMark badge={activity.postAuthorBadge} className="h-3.5 w-3.5" />
    </>
  ) : null
  const target = activity.targetName ? (
    <>
      <span className="font-semibold">{activity.targetName}</span>{' '}
      <BadgeMark badge={activity.targetBadge} className="h-3.5 w-3.5" />
    </>
  ) : null
  switch (activity.type) {
    case 'like':
      return (
        <>
          {actor} liked {postAuthor ? <>{postAuthor}&rsquo;s post</> : 'a post'}
        </>
      )
    case 'comment':
      return (
        <>
          {actor} commented on {postAuthor ? <>{postAuthor}&rsquo;s post</> : 'a post'}
        </>
      )
    case 'follow':
      return (
        <>
          {actor} started following {target ?? 'someone'}
        </>
      )
    case 'testimonial':
      return (
        <>
          {actor} wrote a testimonial for {target ?? 'someone'}
        </>
      )
    case 'badge':
      return (
        <>
          {actor} earned the{' '}
          <span className="font-semibold">{activity.badgeEarned?.name ?? 'a'} badge</span>
        </>
      )
    case 'profile_view':
      return <>{actor} viewed your profile</>
    case 'hangout_join': {
      const roomName =
        activity.cardRoomName ??
        activity.nhieRoomName ??
        activity.videokeRoomName ??
        (activity.hangoutKind === 'cards'
          ? 'card game'
          : activity.hangoutKind === 'nhie'
            ? 'Never Have I Ever'
            : 'videoke')
      return activity.hangoutJoinKind === 'hosted' ? (
        <>
          {actor} started a <span className="font-semibold">{roomName}</span> hangout
        </>
      ) : (
        <>
          {actor} joined a <span className="font-semibold">{roomName}</span> hangout
          {target ? <> hosted by {target}</> : null}
        </>
      )
    }
  }
}

const dayKey = (iso: string) => new Date(iso).toDateString()

const dayLabel = (iso: string) => {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(iso) === today.toDateString()) return 'Today'
  if (dayKey(iso) === yesterday.toDateString()) return 'Yesterday'
  const sameYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

type StackEntry = { kind: 'stack'; postId: number; items: ActivityData[] }
type BadgeStackEntry = { kind: 'badge-stack'; items: ActivityData[] }
type FollowStackEntry = { kind: 'follow-stack'; actorUsername: string; items: ActivityData[] }
type ViewStackEntry = { kind: 'view-stack'; items: ActivityData[] }
type HangoutStackEntry = { kind: 'hangout-stack'; actorUsername: string; items: ActivityData[] }
type ActivityEntry =
  | { kind: 'row'; activity: ActivityData }
  | StackEntry
  | BadgeStackEntry
  | FollowStackEntry
  | ViewStackEntry
  | HangoutStackEntry

// Fingerprint probe throttle (rapid toggles) and poll cadence while the tab
// is open — the probe is ~2 indexed queries versus ~15 for a blind page-1
// refetch, so polling cheaply replaces the old stale-time refetch.
const CHECK_MS = 10_000
const POLL_MS = 60_000

// Latest likes, comments, and follows from people the viewer follows —
// the home "Activities" tab. Rows are grouped into day sections so the
// stream reads like a journal of what your circle has been up to.
export function ActivitiesView({
  activities,
  initialHasMore,
  initialFingerprint,
  cacheViewerId,
}: {
  activities: ActivityData[]
  initialHasMore: boolean
  initialFingerprint?: string
  cacheViewerId?: number
}) {
  const router = useRouter()
  // Rendered inside a HomeTabs panel slot — context carries the active tab
  // across the server-slot boundary. Refetches stale data on activation.
  const active = useContext(HomeTabContext) === 'activities'
  const [items, setItems] = useState(activities)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, startTransition] = useTransition()
  const [prevInitial, setPrevInitial] = useState(activities)
  const [openPostId, setOpenPostId] = useState<number | null>(null)
  const [viewPostId, setViewPostId] = useState<number | null>(null)
  const [badgeActivity, setBadgeActivity] = useState<ActivityData | null>(null)

  // Server-side fingerprint of the feed's inputs — captured at every fetch
  // (SSR prop, page-1 refresh, pagination) so activation probes can compare.
  const fingerprintRef = useRef(initialFingerprint)
  const lastCheckRef = useRef(0)

  // Fresh server props (router refresh) reset the fingerprint baseline and
  // refresh the persistent cache — SSR'd data is page 1 by definition.
  useEffect(() => {
    fingerprintRef.current = initialFingerprint
    if (cacheViewerId && initialFingerprint) {
      writeActivitiesCache(cacheViewerId, {
        items: activities,
        hasMore: initialHasMore,
        fingerprint: initialFingerprint,
      })
    }
  }, [activities, initialHasMore, initialFingerprint, cacheViewerId])

  // Reconcile when the server re-renders the list (e.g. router.refresh()): keep
  // pages loaded via infinite scroll if the refreshed first page still matches.
  if (prevInitial !== activities) {
    setPrevInitial(activities)
    const sameHead =
      activities.length > 0 &&
      items.length >= activities.length &&
      activities.every((a, i) => items[i].id === a.id)
    if (sameHead) {
      setItems([...activities, ...items.slice(activities.length)])
    } else {
      setItems(activities)
      setPage(1)
      setHasMore(initialHasMore)
    }
  }

  // Tab-open + open-tab refresh: probe the fingerprint first and only pay for
  // a page-1 refetch when it moved. The fresh page dedupe-merges over the
  // head so pages loaded via infinite scroll stay attached below it.
  useEffect(() => {
    if (!active) return
    const check = () => {
      if (pending || document.hidden || Date.now() - lastCheckRef.current < CHECK_MS) return
      lastCheckRef.current = Date.now()
      startTransition(async () => {
        const { fingerprint } = await getActivitiesFingerprint()
        if (fingerprint === fingerprintRef.current) return
        const result = await loadMoreActivities(1)
        fingerprintRef.current = result.fingerprint
        setItems((prev) => {
          const fresh = new Set(result.items.map((a) => a.id))
          return [...result.items, ...prev.filter((a) => !fresh.has(a.id))]
        })
        setHasMore(result.hasMore)
        if (cacheViewerId) {
          writeActivitiesCache(cacheViewerId, {
            items: result.items,
            hasMore: result.hasMore,
            fingerprint: result.fingerprint,
          })
        }
      })
    }
    check()
    const timer = setInterval(check, POLL_MS)
    return () => clearInterval(timer)
  }, [active, pending, cacheViewerId])

  // Activities on the same post stack into one entry per day (Facebook-style):
  // the post card renders once with every actor line above it. Follows stack
  // per actor per day, badges per day. A stack sits where its newest activity
  // falls in the stream.
  const groups = useMemo(() => {
    const out: { key: string; label: string; entries: ActivityEntry[] }[] = []
    for (const activity of items) {
      const key = dayKey(activity.createdAt)
      let day = out[out.length - 1]
      if (!day || day.key !== key) {
        day = { key, label: dayLabel(activity.createdAt), entries: [] }
        out.push(day)
      }
      if (activity.type === 'badge') {
        // Badge earns collapse into one "N users got an achievement" stack
        // per day — individual earns expand inside it.
        const stack = day.entries.find((e): e is BadgeStackEntry => e.kind === 'badge-stack')
        if (stack) stack.items.push(activity)
        else day.entries.push({ kind: 'badge-stack', items: [activity] })
      } else if (activity.type === 'follow') {
        // A user's follows collapse into one "started following N people"
        // stack per day — individual follows expand inside it.
        const stack = day.entries.find(
          (e): e is FollowStackEntry =>
            e.kind === 'follow-stack' && e.actorUsername === activity.actorUsername,
        )
        if (stack) stack.items.push(activity)
        else
          day.entries.push({
            kind: 'follow-stack',
            actorUsername: activity.actorUsername,
            items: [activity],
          })
      } else if (activity.type === 'hangout_join') {
        // A member's hangout activity in a day collapses into one "joined N
        // hangouts" stack per actor — individual joins expand inside it.
        const stack = day.entries.find(
          (e): e is HangoutStackEntry =>
            e.kind === 'hangout-stack' && e.actorUsername === activity.actorUsername,
        )
        if (stack) stack.items.push(activity)
        else
          day.entries.push({
            kind: 'hangout-stack',
            actorUsername: activity.actorUsername,
            items: [activity],
          })
      } else if (activity.type === 'profile_view') {
        // Viewers of your profile collapse into one "N people viewed your
        // profile" stack per day — individual views expand inside it.
        const stack = day.entries.find((e): e is ViewStackEntry => e.kind === 'view-stack')
        if (stack) stack.items.push(activity)
        else day.entries.push({ kind: 'view-stack', items: [activity] })
      } else if (activity.post && activity.postId !== undefined) {
        const stack = day.entries.find(
          (e): e is StackEntry => e.kind === 'stack' && e.postId === activity.postId,
        )
        if (stack) stack.items.push(activity)
        else day.entries.push({ kind: 'stack', postId: activity.postId, items: [activity] })
      } else {
        day.entries.push({ kind: 'row', activity })
      }
    }
    return out
  }, [items])

  const loadMore = useCallback(() => {
    if (pending) return
    startTransition(async () => {
      const next = page + 1
      const result = await loadMoreActivities(next)
      fingerprintRef.current = result.fingerprint
      setItems((prev) => {
        const seen = new Set(prev.map((a) => a.id))
        return [...prev, ...result.items.filter((a) => !seen.has(a.id))]
      })
      setPage(next)
      setHasMore(result.hasMore)
    })
  }, [pending, page])

  const open = useCallback(
    (activity: ActivityData) => {
      if (activity.type === 'follow' || activity.type === 'testimonial') {
        if (activity.targetUsername) router.push(`/profile/${activity.targetUsername}`)
      } else if (activity.type === 'profile_view') {
        router.push(`/profile/${activity.actorUsername}`)
      } else if (activity.type === 'badge') {
        setBadgeActivity(activity)
      } else if (activity.type === 'hangout_join') {
        // Rooms are private — parties land inside, mutuals of the host land
        // on the knock gate, and anyone else gets the actor's profile so a
        // room link never leaks to someone who can't enter.
        if (activity.hangoutAccess === 'enter' || activity.hangoutAccess === 'knock') {
          router.push(
            activity.cardRoomId
              ? `/hangouts/cards/${activity.cardRoomId}`
              : activity.nhieRoomId
                ? `/hangouts/nhie/${activity.nhieRoomId}`
                : activity.videokeRoomId
                  ? `/hangouts/videoke/${activity.videokeRoomId}`
                  : '/hangouts',
          )
        } else {
          router.push(`/profile/${activity.actorUsername}`)
        }
      } else if (activity.postId) {
        if (activity.type === 'like') setViewPostId(activity.postId)
        else setOpenPostId(activity.postId)
      }
    },
    [router],
  )

  const closePost = useCallback(() => setOpenPostId(null), [])
  const closeViewPost = useCallback(() => setViewPostId(null), [])
  const closeBadgeSheet = useCallback(() => setBadgeActivity(null), [])

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ActivityIcon />}
        title="No activity yet"
        message="When people you follow like, comment, follow others, or write testimonials, it will show up here — along with opted-in members who viewed your profile."
      />
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.key}>
            <h2 className="mb-2 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
              {group.label}
              <span aria-hidden className="h-px flex-1 bg-black/5" />
            </h2>
            <ul className="flex flex-col">
              {group.entries.map((entry, i) =>
                entry.kind === 'stack' ? (
                  <PostActivityStack
                    key={`post-${entry.postId}`}
                    items={entry.items}
                    pending={pending}
                    isFirst={i === 0}
                    isLast={i === group.entries.length - 1}
                    onOpenAction={open}
                  />
                ) : entry.kind === 'badge-stack' ? (
                  entry.items.length === 1 ? (
                    <ActivityItem
                      key={entry.items[0].id}
                      activity={entry.items[0]}
                      pending={pending}
                      isFirst={i === 0}
                      isLast={i === group.entries.length - 1}
                      onOpenAction={open}
                    />
                  ) : (
                    <BadgeActivityStack
                      key="badge-stack"
                      items={entry.items}
                      pending={pending}
                      isFirst={i === 0}
                      isLast={i === group.entries.length - 1}
                      onOpenAction={open}
                    />
                  )
                ) : entry.kind === 'follow-stack' ? (
                  entry.items.length === 1 ? (
                    <ActivityItem
                      key={entry.items[0].id}
                      activity={entry.items[0]}
                      pending={pending}
                      isFirst={i === 0}
                      isLast={i === group.entries.length - 1}
                      onOpenAction={open}
                    />
                  ) : (
                    <FollowActivityStack
                      key={`follow-${entry.actorUsername}`}
                      items={entry.items}
                      pending={pending}
                      isFirst={i === 0}
                      isLast={i === group.entries.length - 1}
                      onOpenAction={open}
                    />
                  )
                ) : entry.kind === 'hangout-stack' ? (
                  entry.items.length === 1 ? (
                    <ActivityItem
                      key={entry.items[0].id}
                      activity={entry.items[0]}
                      pending={pending}
                      isFirst={i === 0}
                      isLast={i === group.entries.length - 1}
                      onOpenAction={open}
                    />
                  ) : (
                    <HangoutActivityStack
                      key={`hangout-${entry.actorUsername}`}
                      items={entry.items}
                      pending={pending}
                      isFirst={i === 0}
                      isLast={i === group.entries.length - 1}
                      onOpenAction={open}
                    />
                  )
                ) : entry.kind === 'view-stack' ? (
                  entry.items.length === 1 ? (
                    <ActivityItem
                      key={entry.items[0].id}
                      activity={entry.items[0]}
                      pending={pending}
                      isFirst={i === 0}
                      isLast={i === group.entries.length - 1}
                      onOpenAction={open}
                    />
                  ) : (
                    <ProfileViewActivityStack
                      key="view-stack"
                      items={entry.items}
                      pending={pending}
                      isFirst={i === 0}
                      isLast={i === group.entries.length - 1}
                      onOpenAction={open}
                    />
                  )
                ) : (
                  <ActivityItem
                    key={entry.activity.id}
                    activity={entry.activity}
                    pending={pending}
                    isFirst={i === 0}
                    isLast={i === group.entries.length - 1}
                    onOpenAction={open}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>

      <LoadSentinel hasMore={hasMore} pending={pending} onLoadAction={loadMore} />

      <CommentsSheet
        postId={openPostId ?? -1}
        open={openPostId !== null}
        onCloseAction={closePost}
        showPost
      />
      <PostSheet
        postId={viewPostId ?? -1}
        open={viewPostId !== null}
        onCloseAction={closeViewPost}
      />
      <BadgeSheet activity={badgeActivity} onCloseAction={closeBadgeSheet} />
    </div>
  )
}

type CachedActivities = Paged<ActivityData> & { fingerprint: string }

// Page-1 activities cached per viewer — module memory covers in-app
// navigations, localStorage covers PWA cold starts. Both get validated
// against the server fingerprint on tab activation, so a stale cache never
// survives a check.
const memoryCache = new Map<number, CachedActivities>()
const cacheKey = (viewerId: number) => `kitakits:activities:${viewerId}`

const readActivitiesCache = (viewerId: number): CachedActivities | null => {
  const mem = memoryCache.get(viewerId)
  if (mem) return mem
  try {
    const raw = window.localStorage.getItem(cacheKey(viewerId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedActivities
    if (!Array.isArray(parsed.items) || typeof parsed.fingerprint !== 'string') return null
    memoryCache.set(viewerId, parsed)
    return parsed
  } catch {
    return null
  }
}

const writeActivitiesCache = (viewerId: number, data: CachedActivities) => {
  memoryCache.set(viewerId, data)
  try {
    window.localStorage.setItem(cacheKey(viewerId), JSON.stringify(data))
  } catch {}
}

// Lazy variant of the Activities panel — fetches the first page via the
// loadMoreActivities action only when the tab is opened, so /home loads for
// the feed/saved tabs never run the activities query. A cached page renders
// instantly instead of the skeleton, and ActivitiesView revalidates it via
// the fingerprint probe on activation. Once mounted it stays mounted (panels
// hide rather than unmount). Direct ?tab=activities loads get the SSR panel
// from the page instead of this.
export function LazyActivities({ viewerId }: { viewerId: number }) {
  const active = useContext(HomeTabContext) === 'activities'
  // Memory-only in the initializer — identical on server and client so SSR
  // hydration stays consistent; localStorage seeds in the effect below.
  const [data, setData] = useState<CachedActivities | null>(() =>
    typeof window === 'undefined' ? null : (memoryCache.get(viewerId) ?? null),
  )
  const fetchingRef = useRef(false)

  const sync = useCallback(
    (page: CachedActivities) => {
      writeActivitiesCache(viewerId, page)
      setData(page)
    },
    [viewerId],
  )

  useEffect(() => {
    if (data) return
    const cached = readActivitiesCache(viewerId)
    if (cached) queueMicrotask(() => setData(cached))
  }, [viewerId, data])

  useEffect(() => {
    if (!active || data || fetchingRef.current) return
    fetchingRef.current = true
    loadMoreActivities(1)
      .then((result) => {
        sync({ items: result.items, hasMore: result.hasMore, fingerprint: result.fingerprint })
        fetchingRef.current = false
      })
      // Keep the skeleton up — toggling away and back retries.
      .catch(() => {
        fetchingRef.current = false
      })
  }, [active, data, sync])

  // Idle warm-up: once the page settles, revalidate the cache with the cheap
  // fingerprint probe so the tab paints instantly when opened. Only runs when
  // a cache exists — viewers who never open Activities still pay nothing.
  useEffect(() => {
    if (!data || active) return
    const timer = setTimeout(async () => {
      if (fetchingRef.current) return
      try {
        const { fingerprint } = await getActivitiesFingerprint()
        const cached = readActivitiesCache(viewerId)
        if (cached && fingerprint === cached.fingerprint) return
        fetchingRef.current = true
        const result = await loadMoreActivities(1)
        sync({ items: result.items, hasMore: result.hasMore, fingerprint: result.fingerprint })
      } catch {
      } finally {
        fetchingRef.current = false
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [data, active, viewerId, sync])

  if (!data) return active ? <ActivityListSkeleton /> : null
  return (
    <ActivitiesView
      activities={data.items}
      initialHasMore={data.hasMore}
      initialFingerprint={data.fingerprint}
      cacheViewerId={viewerId}
    />
  )
}

// Timeline rail outside the card — per-row segments join into one continuous
// spine, trimmed to start at the first node and end at the last. Each row's
// type icon sits on it as the node, aligned with the avatar's vertical center.
const Rail = ({
  type,
  single,
  isFirst,
  isLast,
}: {
  type: ActivityData['type']
  single: boolean
  isFirst: boolean
  isLast: boolean
}) => (
  <span aria-hidden className="relative w-8 shrink-0">
    <span
      className={`absolute left-1/2 w-px -translate-x-1/2 bg-neutral-300/80 ${
        single
          ? 'hidden'
          : isLast
            ? 'top-0 h-[34px]'
            : isFirst
              ? 'bottom-0 top-[34px]'
              : 'inset-y-0'
      }`}
    />
    <span
      className={`absolute left-1/2 top-[22px] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full ring-[3px] ring-white/80 ${typeColor[type]}`}
    >
      {typeIcon[type]}
    </span>
  </span>
)

// All like/comment activities on the same post, stacked above a single post
// card — the way Facebook groups "X and Y reacted to this post".
const PostActivityStack = memo(function PostActivityStack({
  items,
  pending,
  isFirst,
  isLast,
  onOpenAction,
}: {
  items: ActivityData[]
  pending: boolean
  isFirst: boolean
  isLast: boolean
  onOpenAction: (activity: ActivityData) => void
}) {
  const post = items[0].post
  if (!post) return null
  const single = isFirst && isLast
  return (
    <li className="flex">
      <Rail type={items[0].type} single={single} isFirst={isFirst} isLast={isLast} />
      <div className="min-w-0 flex-1 pb-2.5 pl-2">
        <div className="flex flex-col">
          {items.map((activity, i) => (
            <button
              key={activity.id}
              onClick={() => onOpenAction(activity)}
              disabled={pending}
              className={`group flex w-full items-center gap-3 rounded-2xl px-3.5 text-left transition-colors hover:bg-accent-50/40 disabled:opacity-60 ${
                i === 0 ? 'pb-1.5 pt-[18px]' : 'py-1.5'
              }`}
            >
              {/* Actor avatar with a small type badge, like Facebook's
                  notification icons. */}
              <span className="relative shrink-0">
                <Avatar src={activity.actorAvatarUrl} name={activity.actorName} size="sm" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-white ${typeColor[activity.type]}`}
                >
                  {typeIcon[activity.type]}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm text-neutral-700">
                  <ActivityText activity={activity} />
                </span>
                {activity.commentSnippet && (
                  <span className="mt-1 line-clamp-2 block rounded-lg border-l-2 border-accent-400/50 bg-black/5 py-1 pl-2 pr-2.5 text-xs italic text-neutral-600">
                    &ldquo;{activity.commentSnippet}&rdquo;
                  </span>
                )}
                <span className="mt-0.5 block text-[11px] text-neutral-400">
                  @{activity.actorUsername} · <RelativeTime iso={activity.createdAt} />
                </span>
              </span>

              <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-accent-500" />
            </button>
          ))}
        </div>
        <PostCard post={post} />
      </div>
    </li>
  )
})

// Badge earns in a day collapse into one entry — "N users got an
// achievement" with overlapping avatars; expanding lists each earn.
const BadgeActivityStack = memo(function BadgeActivityStack({
  items,
  pending,
  isFirst,
  isLast,
  onOpenAction,
}: {
  items: ActivityData[]
  pending: boolean
  isFirst: boolean
  isLast: boolean
  onOpenAction: (activity: ActivityData) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const single = isFirst && isLast
  // One avatar per user — someone earning two badges in a day shouldn't
  // occupy two ring slots or count twice in the summary.
  const uniqueActors = useMemo(() => {
    const seen = new Set<string>()
    return items.filter((a) => !seen.has(a.actorUsername) && seen.add(a.actorUsername))
  }, [items])
  const preview = uniqueActors.slice(0, 4)
  const userCount = uniqueActors.length

  return (
    <li className="flex">
      <Rail type="badge" single={single} isFirst={isFirst} isLast={isLast} />
      <div className="min-w-0 flex-1 pb-2.5 pl-2">
        <div className="glass flex flex-col rounded-2xl">
          <button
            onClick={() => setExpanded((v) => !v)}
            disabled={pending}
            className="group flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-all hover:bg-accent-50/40 disabled:opacity-60"
            aria-expanded={expanded}
          >
            <span className="flex items-center -space-x-2">
              {preview.map((activity) => (
                <span key={activity.id} className="rounded-full ring-2 ring-white">
                  <Avatar src={activity.actorAvatarUrl} name={activity.actorName} size="sm" />
                </span>
              ))}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-neutral-700">
                <span className="font-semibold">{userCount}</span>{' '}
                {userCount === 1 ? 'user' : 'users'} got{' '}
                {items.length > 1 ? 'new achievements' : 'an achievement'}
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-400">
                <RelativeTime iso={items[0].createdAt} />
              </span>
            </span>

            <ChevronRightIcon
              className={`h-4 w-4 shrink-0 text-neutral-300 transition-all group-hover:text-accent-500 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </button>

          {expanded && (
            <ul className="border-t border-black/5 px-2 py-1.5">
              {items.map((activity) => (
                <li key={activity.id}>
                  <button
                    onClick={() => onOpenAction(activity)}
                    disabled={pending}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent-50/40 disabled:opacity-60"
                  >
                    <Avatar src={activity.actorAvatarUrl} name={activity.actorName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-700">
                        <ActivityText activity={activity} />
                      </span>
                      <span className="block text-[11px] text-neutral-400">
                        @{activity.actorUsername} · <RelativeTime iso={activity.createdAt} />
                      </span>
                    </span>
                    {activity.badgeEarned && (
                      <BadgeMark
                        badge={activity.badgeEarned}
                        className="h-7 w-7 shrink-0 transition-transform group-hover:scale-110"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
})

// One user's follows in a day collapse into one entry — "Maria started
// following N people" with the followed users' overlapping avatars;
// expanding lists each follow.
const FollowActivityStack = memo(function FollowActivityStack({
  items,
  pending,
  isFirst,
  isLast,
  onOpenAction,
}: {
  items: ActivityData[]
  pending: boolean
  isFirst: boolean
  isLast: boolean
  onOpenAction: (activity: ActivityData) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const single = isFirst && isLast
  const actor = items[0]
  // One avatar per followed user — a refollow after an unfollow shouldn't
  // occupy two ring slots or count twice in the summary.
  const uniqueTargets = useMemo(() => {
    const seen = new Set<string>()
    return items.filter((a) => {
      const key = a.targetUsername ?? a.id
      return !seen.has(key) && seen.add(key)
    })
  }, [items])
  const preview = uniqueTargets.slice(0, 4)
  const peopleCount = uniqueTargets.length

  return (
    <li className="flex">
      <Rail type="follow" single={single} isFirst={isFirst} isLast={isLast} />
      <div className="min-w-0 flex-1 pb-2.5 pl-2">
        <div className="glass flex flex-col rounded-2xl">
          <button
            onClick={() => setExpanded((v) => !v)}
            disabled={pending}
            className="group flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-all hover:bg-accent-50/40 disabled:opacity-60"
            aria-expanded={expanded}
          >
            <Avatar src={actor.actorAvatarUrl} name={actor.actorName} />

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-neutral-700">
                <span className="font-semibold">{actor.actorName}</span>{' '}
                <BadgeMark badge={actor.actorBadge} className="h-3.5 w-3.5" /> started following{' '}
                <span className="font-semibold">
                  {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-400">
                @{actor.actorUsername} · <RelativeTime iso={items[0].createdAt} />
              </span>
            </span>

            <span className="flex shrink-0 items-center -space-x-2">
              {preview.map((activity) => (
                <span key={activity.id} className="rounded-full ring-2 ring-white">
                  <Avatar
                    src={activity.targetAvatarUrl}
                    name={activity.targetName ?? '?'}
                    size="xs"
                  />
                </span>
              ))}
            </span>

            <ChevronRightIcon
              className={`h-4 w-4 shrink-0 text-neutral-300 transition-all group-hover:text-accent-500 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </button>

          {expanded && (
            <ul className="border-t border-black/5 px-2 py-1.5">
              {items.map((activity) => (
                <li key={activity.id}>
                  <button
                    onClick={() => onOpenAction(activity)}
                    disabled={pending}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent-50/40 disabled:opacity-60"
                  >
                    <Avatar
                      src={activity.targetAvatarUrl}
                      name={activity.targetName ?? '?'}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-700">
                        <ActivityText activity={activity} />
                      </span>
                      <span className="block text-[11px] text-neutral-400">
                        {activity.targetUsername ? `@${activity.targetUsername} · ` : ''}
                        <RelativeTime iso={activity.createdAt} />
                      </span>
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-accent-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
})

// One member's hangout activity in a day collapses into one entry — "Maria
// joined N hangouts" (or "hosted N hangouts") with the hosts' overlapping
// avatars; expanding lists each join. Rows open the room itself.
const HangoutActivityStack = memo(function HangoutActivityStack({
  items,
  pending,
  isFirst,
  isLast,
  onOpenAction,
}: {
  items: ActivityData[]
  pending: boolean
  isFirst: boolean
  isLast: boolean
  onOpenAction: (activity: ActivityData) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const single = isFirst && isLast
  const actor = items[0]
  // One avatar per host — two rooms hosted by the same person shouldn't
  // occupy two ring slots. Self-hosted rooms have no inviter, so no avatar.
  const uniqueHosts = useMemo(() => {
    const seen = new Set<string>()
    return items.filter(
      (a) => a.targetUsername && !seen.has(a.targetUsername) && seen.add(a.targetUsername),
    )
  }, [items])
  const preview = uniqueHosts.slice(0, 4)
  // One count per room — a rejoin bumps the same row, but dedupe anyway.
  const roomCount = new Set(
    items.map((a) => a.videokeRoomId ?? a.cardRoomId ?? a.nhieRoomId ?? a.id),
  ).size
  const verb = items.every((a) => a.hangoutJoinKind === 'hosted') ? 'hosted' : 'joined'

  return (
    <li className="flex">
      <Rail type="hangout_join" single={single} isFirst={isFirst} isLast={isLast} />
      <div className="min-w-0 flex-1 pb-2.5 pl-2">
        <div className="glass flex flex-col rounded-2xl">
          <button
            onClick={() => setExpanded((v) => !v)}
            disabled={pending}
            className="group flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-all hover:bg-accent-50/40 disabled:opacity-60"
            aria-expanded={expanded}
          >
            <Avatar src={actor.actorAvatarUrl} name={actor.actorName} />

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-neutral-700">
                <span className="font-semibold">{actor.actorName}</span>{' '}
                <BadgeMark badge={actor.actorBadge} className="h-3.5 w-3.5" /> {verb}{' '}
                <span className="font-semibold">
                  {roomCount} {roomCount === 1 ? 'hangout' : 'hangouts'}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-400">
                @{actor.actorUsername} · <RelativeTime iso={items[0].createdAt} />
              </span>
            </span>

            {preview.length > 0 && (
              <span className="flex shrink-0 items-center -space-x-2">
                {preview.map((activity) => (
                  <span key={activity.id} className="rounded-full ring-2 ring-white">
                    <Avatar
                      src={activity.targetAvatarUrl}
                      name={activity.targetName ?? '?'}
                      size="xs"
                    />
                  </span>
                ))}
              </span>
            )}

            <ChevronRightIcon
              className={`h-4 w-4 shrink-0 text-neutral-300 transition-all group-hover:text-accent-500 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </button>

          {expanded && (
            <ul className="border-t border-black/5 px-2 py-1.5">
              {items.map((activity) => (
                <li key={activity.id}>
                  <button
                    onClick={() => onOpenAction(activity)}
                    disabled={pending}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent-50/40 disabled:opacity-60"
                  >
                    <Avatar
                      src={activity.targetAvatarUrl ?? activity.actorAvatarUrl}
                      name={activity.targetName ?? activity.actorName}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-700">
                        <ActivityText activity={activity} />
                      </span>
                      <span className="block text-[11px] text-neutral-400">
                        {activity.targetUsername ? `@${activity.targetUsername} · ` : ''}
                        <RelativeTime iso={activity.createdAt} />
                      </span>
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-accent-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
})

// Viewers of your profile in a day collapse into one entry — "N people
// viewed your profile" with the viewers' overlapping avatars; expanding
// lists each view.
const ProfileViewActivityStack = memo(function ProfileViewActivityStack({
  items,
  pending,
  isFirst,
  isLast,
  onOpenAction,
}: {
  items: ActivityData[]
  pending: boolean
  isFirst: boolean
  isLast: boolean
  onOpenAction: (activity: ActivityData) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const single = isFirst && isLast
  // One avatar per viewer — a re-view shouldn't occupy two ring slots or
  // count twice in the summary.
  const uniqueActors = useMemo(() => {
    const seen = new Set<string>()
    return items.filter((a) => !seen.has(a.actorUsername) && seen.add(a.actorUsername))
  }, [items])
  const preview = uniqueActors.slice(0, 4)
  const peopleCount = uniqueActors.length

  return (
    <li className="flex">
      <Rail type="profile_view" single={single} isFirst={isFirst} isLast={isLast} />
      <div className="min-w-0 flex-1 pb-2.5 pl-2">
        <div className="glass flex flex-col rounded-2xl">
          <button
            onClick={() => setExpanded((v) => !v)}
            disabled={pending}
            className="group flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-all hover:bg-accent-50/40 disabled:opacity-60"
            aria-expanded={expanded}
          >
            <span className="flex items-center -space-x-2">
              {preview.map((activity) => (
                <span key={activity.id} className="rounded-full ring-2 ring-white">
                  <Avatar src={activity.actorAvatarUrl} name={activity.actorName} size="sm" />
                </span>
              ))}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-neutral-700">
                <span className="font-semibold">{peopleCount}</span>{' '}
                {peopleCount === 1 ? 'person' : 'people'} viewed your profile
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-400">
                <RelativeTime iso={items[0].createdAt} />
              </span>
            </span>

            <ChevronRightIcon
              className={`h-4 w-4 shrink-0 text-neutral-300 transition-all group-hover:text-accent-500 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </button>

          {expanded && (
            <ul className="border-t border-black/5 px-2 py-1.5">
              {items.map((activity) => (
                <li key={activity.id}>
                  <button
                    onClick={() => onOpenAction(activity)}
                    disabled={pending}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent-50/40 disabled:opacity-60"
                  >
                    <Avatar src={activity.actorAvatarUrl} name={activity.actorName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-700">
                        <ActivityText activity={activity} />
                      </span>
                      <span className="block text-[11px] text-neutral-400">
                        @{activity.actorUsername} · <RelativeTime iso={activity.createdAt} />
                      </span>
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-accent-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
})

const ActivityItem = memo(function ActivityItem({
  activity,
  pending,
  isFirst,
  isLast,
  onOpenAction,
}: {
  activity: ActivityData
  pending: boolean
  isFirst: boolean
  isLast: boolean
  onOpenAction: (activity: ActivityData) => void
}) {
  const single = isFirst && isLast
  return (
    <li className="flex">
      <Rail type={activity.type} single={single} isFirst={isFirst} isLast={isLast} />
      <div className="min-w-0 flex-1 pb-2.5 pl-2">
        <button
          onClick={() => onOpenAction(activity)}
          disabled={pending}
          className="glass group flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-all hover:bg-accent-50/40 disabled:opacity-60"
        >
          <Avatar src={activity.actorAvatarUrl} name={activity.actorName} />

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-neutral-700">
              <ActivityText activity={activity} />
            </span>
            {activity.commentSnippet || activity.testimonialSnippet ? (
              <span className="mt-1.5 line-clamp-2 block rounded-lg border-l-2 border-accent-400/50 bg-black/5 py-1.5 pl-2.5 pr-3 text-xs italic text-neutral-600">
                &ldquo;{activity.commentSnippet ?? activity.testimonialSnippet}&rdquo;
              </span>
            ) : activity.postSnippet ? (
              <span className="mt-1.5 line-clamp-2 block rounded-lg bg-black/5 px-2.5 py-1.5 text-xs text-neutral-500">
                {activity.postSnippet}
              </span>
            ) : null}
            <span className="mt-1 block text-[11px] text-neutral-400">
              @{activity.actorUsername} · <RelativeTime iso={activity.createdAt} />
            </span>
          </span>

          {/* Trailing cue — the earned badge's disc on badge rows, the target
              user's avatar on follow/testimonial rows, a chevron on post rows
              (they open a sheet). */}
          {activity.type === 'badge' && activity.badgeEarned ? (
            <BadgeMark
              badge={activity.badgeEarned}
              className="h-9 w-9 shrink-0 transition-transform group-hover:scale-110"
            />
          ) : (activity.type === 'follow' || activity.type === 'testimonial') &&
            activity.targetName ? (
            <span className="shrink-0 transition-transform group-hover:scale-105">
              <Avatar src={activity.targetAvatarUrl} name={activity.targetName} size="sm" />
            </span>
          ) : (
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-accent-500" />
          )}
        </button>
      </div>
    </li>
  )
})

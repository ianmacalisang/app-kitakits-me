'use client'

import { useRouter } from 'next/navigation'
import { memo, useCallback, useMemo, useState, useTransition } from 'react'

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from '@/actions/notifications'
import type { NotificationData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { CommentsSheet } from './CommentsSheet'
import { CountBadge } from './CountBadge'
import { EmptyState } from './EmptyState'
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  CommentIcon,
  HeartIcon,
  MedalIcon,
  QuoteIcon,
  UserIcon,
} from './icons'
import { PostSheet } from './PostSheet'
import { LoadSentinel } from './LoadSentinel'
import { RelativeTime } from './RelativeTime'

const typeIcon = {
  like: <HeartIcon className="h-2.5 w-2.5" filled />,
  comment: <CommentIcon className="h-2.5 w-2.5" />,
  follow: <UserIcon className="h-2.5 w-2.5" />,
  testimonial: <QuoteIcon className="h-2.5 w-2.5" />,
  badge: <MedalIcon className="h-2.5 w-2.5" />,
}

// Larger variant for the timeline icons inside expanded stacks.
const typeIconLg = {
  like: <HeartIcon className="h-3 w-3" filled />,
  comment: <CommentIcon className="h-3 w-3" />,
  follow: <UserIcon className="h-3 w-3" />,
  testimonial: <QuoteIcon className="h-3 w-3" />,
  badge: <MedalIcon className="h-3 w-3" />,
}

const notificationText = (n: NotificationData) => {
  if (n.type === 'like') return 'liked your post'
  if (n.type === 'comment') return 'commented on your post'
  if (n.type === 'follow') return 'started following you'
  if (n.type === 'badge') return `earned the “${n.badgeName ?? 'new'}” badge`
  return n.testimonialEvent === 'approved' ? 'approved your testimonial' : 'wrote you a testimonial'
}

// Summary line for a same-user stack, e.g. "liked 2 of your posts and
// commented on your post". Phrases follow recency (items arrive newest-first)
// and post actions count distinct posts.
const stackText = (items: NotificationData[]) => {
  const distinctPosts = (type: 'like' | 'comment') =>
    new Set(items.filter((n) => n.type === type).map((n) => n.postId ?? n.id)).size

  const parts: { idx: number; text: string }[] = []
  const likes = distinctPosts('like')
  if (likes) {
    parts.push({
      idx: items.findIndex((n) => n.type === 'like'),
      text: likes === 1 ? 'liked your post' : `liked ${likes} of your posts`,
    })
  }
  const comments = distinctPosts('comment')
  if (comments) {
    parts.push({
      idx: items.findIndex((n) => n.type === 'comment'),
      text: comments === 1 ? 'commented on your post' : `commented on ${comments} of your posts`,
    })
  }
  if (items.some((n) => n.type === 'follow')) {
    parts.push({ idx: items.findIndex((n) => n.type === 'follow'), text: 'started following you' })
  }
  const testimonials = items.filter((n) => n.type === 'testimonial')
  if (testimonials.length > 0) {
    parts.push({
      idx: items.findIndex((n) => n.type === 'testimonial'),
      text:
        testimonials.length === 1
          ? notificationText(testimonials[0])
          : `sent ${testimonials.length} testimonial updates`,
    })
  }
  const badges = items.filter((n) => n.type === 'badge')
  if (badges.length > 0) {
    parts.push({
      idx: items.findIndex((n) => n.type === 'badge'),
      text: badges.length === 1 ? notificationText(badges[0]) : `earned ${badges.length} badges`,
    })
  }

  parts.sort((a, b) => a.idx - b.idx)
  const phrases = parts.map((p) => p.text)
  if (phrases.length <= 1) return phrases[0] ?? notificationText(items[0])
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
}

const typeColor = {
  like: 'bg-rose-500 text-white',
  comment: 'bg-accent-500 text-white',
  follow: 'bg-accent-500 text-white',
  testimonial: 'bg-accent-500 text-white',
  badge: 'bg-amber-500 text-white',
}

const sectionLabel = 'mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'

type NotificationEntry = { actorUsername: string; items: NotificationData[] }

// A notification joins the actor's open stack only when it lands within this
// window of the stack's newest item — bursts of activity stack together while
// older visits split into their own entry.
const STACK_WINDOW_MS = 60 * 60 * 1000 // 1 hour

// Notifications from the same user stack into one expandable entry
// (Facebook-style): the collapsed row summarizes every action, and expanding
// reveals one line per notification with its own click target. The stack sits
// where its newest notification falls in the list. Caller passes an already
// sectioned list, so a stack never mixes read and unread items.
const groupNotifications = (list: NotificationData[]): NotificationEntry[] => {
  const entries: NotificationEntry[] = []
  const open = new Map<string, NotificationEntry>()
  for (const notification of list) {
    const stack = open.get(notification.actorUsername)
    const newest = stack?.items[0]
    const withinWindow =
      newest !== undefined &&
      Date.parse(newest.createdAt) - Date.parse(notification.createdAt) <= STACK_WINDOW_MS
    if (stack && withinWindow) {
      stack.items.push(notification)
    } else {
      const entry = { actorUsername: notification.actorUsername, items: [notification] }
      open.set(notification.actorUsername, entry)
      entries.push(entry)
    }
  }
  return entries
}

export function NotificationsView({
  notifications,
  initialHasMore,
  compact = false,
}: {
  notifications: NotificationData[]
  initialHasMore: boolean
  compact?: boolean
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [items, setItems] = useState(notifications)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [morePending, startMoreTransition] = useTransition()
  const [prevInitial, setPrevInitial] = useState(notifications)
  const [openPostId, setOpenPostId] = useState<number | null>(null)
  const [viewPostId, setViewPostId] = useState<number | null>(null)
  // Accordion: only one stack expanded at a time, keyed by its newest item id.
  const [expandedStack, setExpandedStack] = useState<number | null>(null)

  // Reconcile when the server re-renders the list (e.g. router.refresh()): keep
  // pages loaded via infinite scroll if the refreshed first page still matches.
  if (prevInitial !== notifications) {
    setPrevInitial(notifications)
    const sameHead =
      notifications.length > 0 &&
      items.length >= notifications.length &&
      notifications.every((n, i) => items[i].id === n.id)
    if (sameHead) {
      setItems([...notifications, ...items.slice(notifications.length)])
    } else {
      setItems(notifications)
      setPage(1)
      setHasMore(initialHasMore)
    }
  }

  const loadMore = useCallback(() => {
    if (morePending) return
    startMoreTransition(async () => {
      const next = page + 1
      const result = await getNotifications(next)
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id))
        return [...prev, ...result.items.filter((n) => !seen.has(n.id))]
      })
      setPage(next)
      setHasMore(result.hasMore)
    })
  }, [morePending, page])

  const unread = useMemo(() => items.filter((n) => !n.read), [items])
  const read = useMemo(() => items.filter((n) => n.read), [items])
  const unreadEntries = useMemo(() => groupNotifications(unread), [unread])
  const readEntries = useMemo(() => groupNotifications(read), [read])

  // Read state is applied optimistically — the bulk server update and nav
  // refresh run in the background so taps never wait on a round trip.
  const markReadOptimistic = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return
      const idSet = new Set(ids)
      setItems((prev) => prev.map((n) => (idSet.has(n.id) && !n.read ? { ...n, read: true } : n)))
      void markNotificationsRead(ids).then(() => router.refresh())
    },
    [router],
  )

  const markAll = () => {
    setItems((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })))
    void markAllNotificationsRead().then(() => router.refresh())
  }

  // Expanding a stack counts as opening it — mark every item read.
  const markStackRead = useCallback(
    (stack: NotificationData[]) => {
      markReadOptimistic(stack.filter((n) => !n.read).map((n) => n.id))
    },
    [markReadOptimistic],
  )

  // Tapping a line in a stack opens that notification's target. Passing the
  // whole stack marks every notification in it read — the stack is one
  // logical notification, like Facebook's grouped alerts.
  const open = useCallback(
    (notification: NotificationData, stack?: NotificationData[]) => {
      markReadOptimistic((stack ?? [notification]).filter((n) => !n.read).map((n) => n.id))
      if (notification.type === 'follow') {
        router.push(`/profile/${notification.actorUsername}`)
      } else if (notification.type === 'badge') {
        // Badge notifications are self-actor — land on your own profile
        // where the badge shelf shows the new award.
        router.push(`/profile/${notification.actorUsername}`)
      } else if (notification.type === 'testimonial') {
        router.push('/testimonials')
      } else if (notification.postId) {
        if (notification.type === 'like') setViewPostId(notification.postId)
        else setOpenPostId(notification.postId)
      }
    },
    [router, markReadOptimistic],
  )

  const closePost = useCallback(() => setOpenPostId(null), [])
  const closeViewPost = useCallback(() => setViewPostId(null), [])

  const renderEntry = (entry: NotificationEntry) =>
    entry.items.length > 1 ? (
      <NotificationStack
        key={`stack-${entry.items[0].id}`}
        items={entry.items}
        expanded={expandedStack === entry.items[0].id}
        onToggleAction={() =>
          setExpandedStack((cur) => (cur === entry.items[0].id ? null : entry.items[0].id))
        }
        onOpenAction={open}
        onReadAction={markStackRead}
      />
    ) : (
      <NotificationItem key={entry.items[0].id} notification={entry.items[0]} onOpenAction={open} />
    )

  const markAllButton = unread.length > 0 && (
    <button
      onClick={markAll}
      className="text-sm font-medium text-accent-600 transition-colors hover:text-accent-700"
    >
      Mark all as read
    </button>
  )

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Notifications</h1>
          {markAllButton}
        </div>
      )}

      {/* All / Unread filter — full view only; the dropdown shows everything
          since opening it is what surfaces unread items. */}
      {!compact && (
        <div className="glass mb-4 flex rounded-full p-1">
          {(['all', 'unread'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex flex-1 items-center justify-center rounded-full py-1.5 text-sm font-medium capitalize transition-all ${
                filter === value
                  ? 'bg-white/90 text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {value}
              {value === 'unread' && <CountBadge count={unread.length} />}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          compact={compact}
          icon={<BellIcon />}
          title="No notifications yet"
          message="When someone likes, comments, or follows you, it will show up here."
        />
      ) : !compact && filter === 'unread' ? (
        unread.length === 0 ? (
          <EmptyState
            icon={<CheckIcon />}
            title="You’re all caught up"
            message="New notifications will appear here."
          />
        ) : (
          <ul className="flex flex-col gap-1">{unreadEntries.map(renderEntry)}</ul>
        )
      ) : (
        <div className="flex flex-col gap-5">
          {unreadEntries.length > 0 && (
            <section>
              <h2 className={sectionLabel}>New</h2>
              <ul className="flex flex-col gap-1">{unreadEntries.map(renderEntry)}</ul>
            </section>
          )}
          {readEntries.length > 0 && (
            <section>
              <h2 className={sectionLabel}>Earlier</h2>
              <ul className="flex flex-col gap-1">{readEntries.map(renderEntry)}</ul>
            </section>
          )}
        </div>
      )}

      <LoadSentinel hasMore={hasMore} pending={morePending} onLoadAction={loadMore} />

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
    </div>
  )
}

const NotificationItem = memo(function NotificationItem({
  notification,
  onOpenAction,
}: {
  notification: NotificationData
  onOpenAction: (notification: NotificationData) => void
}) {
  return (
    <li>
      <button
        onClick={() => onOpenAction(notification)}
        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
          notification.read ? 'border-transparent hover:bg-white/60' : 'glass hover:bg-white'
        }`}
      >
        {/* Avatar with a corner type badge */}
        <span className="relative shrink-0">
          <Avatar src={notification.actorAvatarUrl} name={notification.actorName} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white/80 ${typeColor[notification.type]}`}
          >
            {typeIcon[notification.type]}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">
            <span className="font-semibold">{notification.actorName}</span>{' '}
            <BadgeMark badge={notification.actorBadge} /> {notificationText(notification)}
          </span>
          {notification.commentSnippet && (
            <span className="block truncate text-xs italic text-neutral-600">
              “{notification.commentSnippet}”
            </span>
          )}
          {notification.testimonialSnippet && (
            <span className="block truncate text-xs italic text-neutral-600">
              “{notification.testimonialSnippet}”
            </span>
          )}
          {!notification.commentSnippet &&
            !notification.testimonialSnippet &&
            notification.postSnippet && (
              <span className="block truncate text-xs text-neutral-500">
                {notification.postSnippet}
              </span>
            )}
          <span className="block text-xs text-neutral-500">
            @{notification.actorUsername} · <RelativeTime iso={notification.createdAt} />
          </span>
        </span>
        {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
      </button>
    </li>
  )
})

// All notifications from the same user collapse into one expandable row — the
// header summarizes every action ("liked 2 of your posts and commented on
// your post") with the newest item's badge and snippet. Expanding marks the
// stack read and reveals one line per notification, each opening its own
// post/profile — so different posts stay reachable, like Facebook's grouped
// alerts.
const NotificationStack = memo(function NotificationStack({
  items,
  expanded,
  onToggleAction,
  onOpenAction,
  onReadAction,
}: {
  items: NotificationData[]
  expanded: boolean
  onToggleAction: () => void
  onOpenAction: (notification: NotificationData, stack?: NotificationData[]) => void
  onReadAction: (stack: NotificationData[]) => void
}) {
  const newest = items[0]
  const hasUnread = items.some((n) => !n.read)
  const quote =
    items.find((n) => n.commentSnippet)?.commentSnippet ??
    items.find((n) => n.testimonialSnippet)?.testimonialSnippet
  const context = quote ?? items.find((n) => n.postSnippet)?.postSnippet

  const toggle = () => {
    if (!expanded && hasUnread) onReadAction(items)
    onToggleAction()
  }

  return (
    <li
      className={`rounded-2xl border transition-all ${hasUnread ? 'glass' : 'border-transparent'}`}
    >
      <button
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-white/60"
      >
        {/* Avatar with a corner type badge */}
        <span className="relative shrink-0">
          <Avatar src={newest.actorAvatarUrl} name={newest.actorName} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white/80 ${typeColor[newest.type]}`}
          >
            {typeIcon[newest.type]}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm">
            <span className="font-semibold">{newest.actorName}</span>{' '}
            <BadgeMark badge={newest.actorBadge} /> {stackText(items)}
          </span>
          {context && (
            <span
              className={`block truncate text-xs ${
                quote ? 'italic text-neutral-600' : 'text-neutral-500'
              }`}
            >
              {quote ? `“${quote}”` : context}
            </span>
          )}
          <span className="block text-xs text-neutral-500">
            @{newest.actorUsername} · <RelativeTime iso={newest.createdAt} />
          </span>
        </span>
        {hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {expanded && (
        <div className="mx-3 mb-2.5 mt-0.5 flex flex-col border-t border-neutral-200/60 dark:border-white/10">
          {items.map((notification) => {
            const isQuote = Boolean(notification.commentSnippet ?? notification.testimonialSnippet)
            const lineSnippet =
              notification.commentSnippet ??
              notification.testimonialSnippet ??
              notification.postSnippet
            const action = notificationText(notification)
            return (
              <button
                key={notification.id}
                onClick={() => onOpenAction(notification, items)}
                className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-2.5 text-left transition-colors hover:bg-white/60 active:bg-white/80"
              >
                {/* Timeline icon — the rail runs the full row height so
                    consecutive rows connect into one line under the avatar. */}
                <span className="relative flex w-7 shrink-0 justify-center self-stretch">
                  <span className="absolute inset-y-0 w-px bg-neutral-200/80 dark:bg-white/10" />
                  <span
                    className={`relative z-10 my-auto flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white/80 ${typeColor[notification.type]}`}
                  >
                    {typeIconLg[notification.type]}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="shrink-0 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                  </span>
                  {lineSnippet && (
                    <span
                      className={`min-w-0 truncate text-[11px] ${
                        isQuote
                          ? 'italic text-neutral-600 dark:text-neutral-300'
                          : 'text-neutral-500 dark:text-neutral-400'
                      }`}
                    >
                      {isQuote ? `“${lineSnippet}”` : lineSnippet}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">
                  <RelativeTime iso={notification.createdAt} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </li>
  )
})

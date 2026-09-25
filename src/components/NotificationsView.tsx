'use client'

import { useRouter } from 'next/navigation'
import { memo, useCallback, useMemo, useState, useTransition } from 'react'

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/actions/notifications'
import type { NotificationData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { CommentsSheet } from './CommentsSheet'
import { EmptyState } from './EmptyState'
import { BellIcon, CheckIcon, CommentIcon, HeartIcon, UserIcon } from './icons'
import { PostSheet } from './PostSheet'
import { LoadSentinel } from './LoadSentinel'

const typeIcon = {
  like: <HeartIcon className="h-2.5 w-2.5" filled />,
  comment: <CommentIcon className="h-2.5 w-2.5" />,
  follow: <UserIcon className="h-2.5 w-2.5" />,
}

const typeText = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
}

const typeColor = {
  like: 'bg-rose-500 text-white',
  comment: 'bg-emerald-500 text-white',
  follow: 'bg-teal-500 text-white',
}

const sectionLabel = 'mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'

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
  const [pending, startTransition] = useTransition()
  const [items, setItems] = useState(notifications)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [morePending, startMoreTransition] = useTransition()
  const [prevInitial, setPrevInitial] = useState(notifications)
  const [openPostId, setOpenPostId] = useState<number | null>(null)
  const [viewPostId, setViewPostId] = useState<number | null>(null)

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

  const markAll = () => {
    startTransition(async () => {
      await markAllNotificationsRead()
      router.refresh()
    })
  }

  const open = useCallback(
    (notification: NotificationData) => {
      startTransition(async () => {
        if (!notification.read) await markNotificationRead(notification.id)
        if (notification.type === 'follow') {
          router.push(`/profile/${notification.actorUsername}`)
        } else if (notification.postId) {
          if (notification.type === 'like') setViewPostId(notification.postId)
          else setOpenPostId(notification.postId)
        }
        router.refresh()
      })
    },
    [router],
  )

  const closePost = useCallback(() => setOpenPostId(null), [])
  const closeViewPost = useCallback(() => setViewPostId(null), [])

  const renderItem = (notification: NotificationData) => (
    <NotificationItem
      key={notification.id}
      notification={notification}
      pending={pending}
      onOpenAction={open}
    />
  )

  const markAllButton = unread.length > 0 && (
    <button
      onClick={markAll}
      disabled={pending}
      className="text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700 disabled:opacity-50"
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

      {/* All / Unread filter */}
      <div className={`glass ${compact ? 'mb-3' : 'mb-4'} flex rounded-full p-1`}>
        {(['all', 'unread'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`flex-1 rounded-full py-1.5 text-sm font-medium capitalize transition-all ${
              filter === value
                ? 'bg-white/90 text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {value === 'unread' && unread.length > 0 ? `Unread (${unread.length})` : value}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          compact={compact}
          icon={<BellIcon />}
          title="No notifications yet"
          message="When someone likes, comments, or follows you, it will show up here."
        />
      ) : filter === 'unread' ? (
        unread.length === 0 ? (
          <EmptyState
            icon={<CheckIcon />}
            title="You’re all caught up"
            message="New notifications will appear here."
          />
        ) : (
          <ul className="flex flex-col gap-1">{unread.map(renderItem)}</ul>
        )
      ) : (
        <div className="flex flex-col gap-5">
          {unread.length > 0 && (
            <section>
              <h2 className={sectionLabel}>New</h2>
              <ul className="flex flex-col gap-1">{unread.map(renderItem)}</ul>
            </section>
          )}
          {read.length > 0 && (
            <section>
              <h2 className={sectionLabel}>Earlier</h2>
              <ul className="flex flex-col gap-1">{read.map(renderItem)}</ul>
            </section>
          )}
        </div>
      )}

      <LoadSentinel hasMore={hasMore} pending={morePending} onLoadAction={loadMore} />

      <CommentsSheet
        postId={openPostId ?? -1}
        open={openPostId !== null}
        onCloseAction={closePost}
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
  pending,
  onOpenAction,
}: {
  notification: NotificationData
  pending: boolean
  onOpenAction: (notification: NotificationData) => void
}) {
  return (
    <li>
      <button
        onClick={() => onOpenAction(notification)}
        disabled={pending}
        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all disabled:opacity-60 ${
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
            {typeText[notification.type]}
          </span>
          {notification.commentSnippet && (
            <span className="block truncate text-xs italic text-neutral-600">
              “{notification.commentSnippet}”
            </span>
          )}
          {!notification.commentSnippet && notification.postSnippet && (
            <span className="block truncate text-xs text-neutral-500">
              {notification.postSnippet}
            </span>
          )}
          <span className="block text-xs text-neutral-500">
            @{notification.actorUsername} · {formatRelativeTime(notification.createdAt)}
          </span>
        </span>
        {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
      </button>
    </li>
  )
})

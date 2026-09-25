'use client'

import { useRouter } from 'next/navigation'
import { memo, useCallback, useMemo, useState, useTransition } from 'react'

import { loadMoreActivities } from '@/actions/activities'
import type { ActivityData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { CommentsSheet } from './CommentsSheet'
import { EmptyState } from './EmptyState'
import { ActivityIcon, ChevronRightIcon, CommentIcon, HeartIcon, UserIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { PostSheet } from './PostSheet'

const typeIcon = {
  like: <HeartIcon className="h-3 w-3" filled />,
  comment: <CommentIcon className="h-3 w-3" />,
  follow: <UserIcon className="h-3 w-3" />,
}

const typeColor = {
  like: 'bg-rose-500 text-white',
  comment: 'bg-emerald-500 text-white',
  follow: 'bg-teal-500 text-white',
}

// "Maria liked Juan's post" — actor and target names in semibold, the verb plain.
const ActivityText = ({ activity }: { activity: ActivityData }) => {
  const actor = <span className="font-semibold">{activity.actorName}</span>
  switch (activity.type) {
    case 'like':
      return (
        <>
          {actor} liked{' '}
          {activity.postAuthorName ? (
            <>
              <span className="font-semibold">{activity.postAuthorName}</span>
              &rsquo;s post
            </>
          ) : (
            'a post'
          )}
        </>
      )
    case 'comment':
      return (
        <>
          {actor} commented on{' '}
          {activity.postAuthorName ? (
            <>
              <span className="font-semibold">{activity.postAuthorName}</span>
              &rsquo;s post
            </>
          ) : (
            'a post'
          )}
        </>
      )
    case 'follow':
      return (
        <>
          {actor} started following{' '}
          {activity.targetName ? (
            <span className="font-semibold">{activity.targetName}</span>
          ) : (
            'someone'
          )}
        </>
      )
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

// Latest likes, comments, and follows from people the viewer follows —
// the home "Activities" tab. Rows are grouped into day sections so the
// stream reads like a journal of what your circle has been up to.
export function ActivitiesView({
  activities,
  initialHasMore,
}: {
  activities: ActivityData[]
  initialHasMore: boolean
}) {
  const router = useRouter()
  const [items, setItems] = useState(activities)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, startTransition] = useTransition()
  const [prevInitial, setPrevInitial] = useState(activities)
  const [openPostId, setOpenPostId] = useState<number | null>(null)
  const [viewPostId, setViewPostId] = useState<number | null>(null)

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

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: ActivityData[] }[] = []
    for (const activity of items) {
      const key = dayKey(activity.createdAt)
      const last = out[out.length - 1]
      if (last && last.key === key) {
        last.items.push(activity)
      } else {
        out.push({ key, label: dayLabel(activity.createdAt), items: [activity] })
      }
    }
    return out
  }, [items])

  const loadMore = useCallback(() => {
    if (pending) return
    startTransition(async () => {
      const next = page + 1
      const result = await loadMoreActivities(next)
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
      if (activity.type === 'follow') {
        if (activity.targetUsername) router.push(`/profile/${activity.targetUsername}`)
      } else if (activity.postId) {
        if (activity.type === 'like') setViewPostId(activity.postId)
        else setOpenPostId(activity.postId)
      }
    },
    [router],
  )

  const closePost = useCallback(() => setOpenPostId(null), [])
  const closeViewPost = useCallback(() => setViewPostId(null), [])

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ActivityIcon />}
        title="No activity yet"
        message="When people you follow like, comment, or follow others, it will show up here."
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
              {group.items.map((activity, i) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  pending={pending}
                  isFirst={i === 0}
                  isLast={i === group.items.length - 1}
                  onOpenAction={open}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <LoadSentinel hasMore={hasMore} pending={pending} onLoadAction={loadMore} />

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
      {/* Timeline rail outside the card — per-row segments join into one
          continuous spine, trimmed to start at the first node and end at the
          last. Each row's type icon sits on it as the node, aligned with the
          avatar's vertical center. */}
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
          className={`absolute left-1/2 top-[22px] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full ring-[3px] ring-white/80 ${typeColor[activity.type]}`}
        >
          {typeIcon[activity.type]}
        </span>
      </span>
      <div className="min-w-0 flex-1 pb-2.5 pl-2">
        <button
          onClick={() => onOpenAction(activity)}
          disabled={pending}
          className="glass group flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-all hover:bg-emerald-50/40 disabled:opacity-60"
        >
          <Avatar src={activity.actorAvatarUrl} name={activity.actorName} />

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-neutral-700">
              <ActivityText activity={activity} />
            </span>
            {activity.commentSnippet ? (
              <span className="mt-1.5 line-clamp-2 block rounded-lg border-l-2 border-emerald-400/50 bg-black/5 py-1.5 pl-2.5 pr-3 text-xs italic text-neutral-600">
                &ldquo;{activity.commentSnippet}&rdquo;
              </span>
            ) : activity.postSnippet ? (
              <span className="mt-1.5 line-clamp-2 block rounded-lg bg-black/5 px-2.5 py-1.5 text-xs text-neutral-500">
                {activity.postSnippet}
              </span>
            ) : null}
            <span className="mt-1 block text-[11px] text-neutral-400">
              @{activity.actorUsername} · {formatRelativeTime(activity.createdAt)}
            </span>
          </span>

          {/* Trailing cue — the followed user's avatar on follow rows, a chevron
              on post rows (they open a sheet). */}
          {activity.type === 'follow' && activity.targetName ? (
            <span className="shrink-0 transition-transform group-hover:scale-105">
              <Avatar src={activity.targetAvatarUrl} name={activity.targetName} size="sm" />
            </span>
          ) : (
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-emerald-500" />
          )}
        </button>
      </div>
    </li>
  )
})

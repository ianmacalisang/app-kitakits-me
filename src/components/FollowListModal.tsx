'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { getFollowList } from '@/actions/follows'
import type { UserCardData } from '@/lib/serialize'

import { EmptyState } from './EmptyState'
import { UsersIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { Spinner } from './Spinner'
import { UserCard } from './UserCard'

const CLOSE_MS = 300

export function FollowListModal({
  userId,
  kind,
  count,
  label,
  onDark,
  badge,
}: {
  userId: number
  kind: 'followers' | 'following'
  count: number
  label: string
  onDark?: boolean
  badge?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [users, setUsers] = useState<UserCardData[] | null>(null)
  const [usersPage, setUsersPage] = useState(1)
  const [usersMore, setUsersMore] = useState(false)
  const [morePending, startMoreTransition] = useTransition()

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, CLOSE_MS)
  }, [closing])

  const loadMore = useCallback(() => {
    if (morePending) return
    startMoreTransition(async () => {
      const next = usersPage + 1
      const result = await getFollowList(userId, kind, next)
      setUsers((prev) => {
        const seen = new Set((prev ?? []).map((u) => u.id))
        return [...(prev ?? []), ...result.items.filter((u) => !seen.has(u.id))]
      })
      setUsersPage(next)
      setUsersMore(result.hasMore)
    })
  }, [morePending, usersPage, userId, kind])

  const openSheet = () => {
    setOpen(true)
    if (users === null) {
      void getFollowList(userId, kind, 1).then((result) => {
        setUsers(result.items)
        setUsersPage(1)
        setUsersMore(result.hasMore)
      })
    }
  }

  // Lock scroll and support Escape while the sheet is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  return (
    <>
      <button
        onClick={openSheet}
        aria-label={`View ${label.toLowerCase()}`}
        className={
          badge
            ? 'inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25'
            : 'text-sm transition hover:underline'
        }
      >
        {badge ? (
          <>
            {count} <span className="font-normal text-white/75">{label}</span>
          </>
        ) : (
          <>
            <span className={`font-semibold ${onDark ? 'text-white' : ''}`}>{count}</span>{' '}
            <span className={onDark ? 'text-white/75' : 'text-neutral-500'}>{label}</span>
          </>
        )}
      </button>

      {/* Sheet — portaled so glass card backdrop-filters can't trap it */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
            <div
              className={`absolute inset-0 bg-emerald-950/40 backdrop-blur-sm ${
                closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
              }`}
              onClick={close}
            />
            <div
              className={`glass relative flex h-[70dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:h-auto sm:max-h-[85vh] sm:rounded-[28px] ${
                closing
                  ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
                  : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
              }`}
            >
              {/* iOS sheet drag handle (mobile) */}
              <div className="mx-auto mb-1 mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" />

              {/* Header: Cancel / title / spacer */}
              <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 pb-3 pt-1 sm:pt-3">
                <button
                  type="button"
                  onClick={close}
                  className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800"
                >
                  Cancel
                </button>
                <h2 className="text-[15px] font-semibold">{label}</h2>
                <span className="w-14" />
              </div>

              {/* Scrollable user list */}
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {users === null ? (
                  <div className="flex h-full min-h-40 items-center justify-center">
                    <Spinner />
                  </div>
                ) : users.length === 0 ? (
                  <EmptyState
                    plain
                    icon={<UsersIcon />}
                    title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {users.map((person) => (
                      <UserCard key={person.id} user={person} />
                    ))}
                  </ul>
                )}
                <LoadSentinel
                  hasMore={users !== null && usersMore}
                  pending={morePending}
                  onLoadAction={loadMore}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

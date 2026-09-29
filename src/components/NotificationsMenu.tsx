'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { getNotifications, markAllNotificationsRead } from '@/actions/notifications'
import type { NotificationData } from '@/lib/serialize'

import { BellIcon } from './icons'
import { NotificationsView } from './NotificationsView'
import { Spinner } from './Spinner'

export function NotificationsMenu({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [, startTransition] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)
  // Set when the badge drop came from our own open-time mark-all — lets the
  // resync effect skip the refetch so this view keeps its unread highlights.
  const autoMarkedRef = useRef(false)

  const refresh = useCallback(
    (markRead = false) => {
      startTransition(async () => {
        const result = await getNotifications(1)
        setNotifications(result.items)
        setHasMore(result.hasMore)
        setLoaded(true)
        // Opening the panel counts as seen — persist read in the background
        // so the badge clears, while this view keeps showing what was unread.
        if (markRead && result.items.some((n) => !n.read)) {
          autoMarkedRef.current = true
          void markAllNotificationsRead().then(() => router.refresh())
        }
      })
    },
    [router],
  )

  // Close the dropdown when clicking outside of it or pressing Escape.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Close when navigating away (e.g. a follow notification opens a profile).
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    setOpen(false)
  }

  // Resync when the unread badge changes after a server refresh — skipped
  // once when the drop came from our own open-time mark-all so the open view
  // keeps showing what was unread.
  useEffect(() => {
    if (!loaded) return
    if (autoMarkedRef.current) {
      autoMarkedRef.current = false
      return
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) refresh(true)
  }

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        title="Notifications"
        aria-expanded={open}
        className={`glass relative flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
          open ? 'text-accent-600' : 'text-neutral-700 hover:text-accent-600'
        }`}
      >
        <span className="relative">
          <BellIcon className="h-6 w-6" />
          {unreadCount ? (
            <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </span>
      </button>

      {/* Stay mounted once loaded (hidden when closed) so open post/comment
          sheets — rendered through portals — survive the dropdown closing. */}
      {(open || loaded) && (
        <div
          // Below sm the pill is too narrow to anchor a panel — pin it to
          // the viewport edges instead (same inset as the chat panel). From
          // sm up it hugs the pill's right edge at a fixed width. The 11rem
          // cap clearance = panel top (~5rem) + floating dock (~6rem), keeping
          // the panel above the bottom nav on short viewports.
          className={`glass-pop motion-safe:animate-menu-pop fixed inset-x-4 top-20 z-20 flex max-h-[min(70vh,calc(100dvh-11rem))] origin-top flex-col overflow-hidden rounded-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:origin-top-right ${
            open ? '' : 'hidden'
          }`}
        >
          {loaded ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <NotificationsView notifications={notifications} initialHasMore={hasMore} compact />
              </div>
            </>
          ) : (
            <div className="flex justify-center p-3 py-12">
              <Spinner className="h-5 w-5 text-neutral-400" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

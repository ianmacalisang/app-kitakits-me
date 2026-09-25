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
  const [pending, startTransition] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getNotifications(1)
      setNotifications(result.items)
      setHasMore(result.hasMore)
      setLoaded(true)
    })
  }, [])

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

  // Resync when the unread badge changes after a server refresh (mark-as-read).
  useEffect(() => {
    if (loaded) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount])

  const markAll = () => {
    startTransition(async () => {
      await markAllNotificationsRead()
      router.refresh()
    })
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) refresh()
  }

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        title="Notifications"
        aria-expanded={open}
        className={`glass relative flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
          open ? 'text-emerald-600' : 'text-neutral-700 hover:text-emerald-600'
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
          className={`glass-pop motion-safe:animate-menu-pop absolute right-0 top-full z-20 mt-2 flex max-h-[70vh] w-[30rem] max-w-[calc(100vw-2rem)] origin-top-right flex-col overflow-hidden rounded-2xl ${
            open ? '' : 'hidden'
          }`}
        >
          {loaded ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <NotificationsView notifications={notifications} initialHasMore={hasMore} compact />
              </div>
              {unreadCount > 0 && (
                <div className="flex justify-end border-t border-neutral-200/60 p-3 dark:border-white/10">
                  <button
                    onClick={markAll}
                    disabled={pending}
                    className="text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700 disabled:opacity-50"
                  >
                    Mark all as read
                  </button>
                </div>
              )}
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

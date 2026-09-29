'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { getChatMutuals } from '@/actions/chat'
import type { MutualHead } from '@/lib/mutuals'

import { Spinner } from '../Spinner'
import { ChatIcon } from '../icons'
import { ChatClient } from './ChatClient'
import { useChat } from './ChatProvider'
import { ChatRoom } from './ChatRoom'

// Nav dropdown housing the whole quick-chat flow — mutual roster, live
// rooms, and the open conversation — so chat is reachable from any page
// without a route change. Open state lives in ChatProvider so the invite /
// accepted banners can pop it open too; the mutual roster is fetched lazily
// on first open (same pattern as NotificationsMenu).
export function ChatMenu() {
  const chat = useChat()
  const open = chat?.menuOpen ?? false
  const [mutuals, setMutuals] = useState<MutualHead[]>([])
  const [loaded, setLoaded] = useState(false)
  const [, startTransition] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    startTransition(async () => {
      setMutuals(await getChatMutuals())
      setLoaded(true)
    })
  }, [])

  // Load the roster whenever the menu opens — covers opens triggered by the
  // invite/accepted banners, not just the toggle button.
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  // Close the dropdown when clicking outside of it. Escape first backs out
  // of an open room to the list, then closes the panel.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) chat?.setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (chat?.activeRoom) chat.openRoom(null)
      else chat?.setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, chat])

  // Keep the mobile panel inside the visual viewport. The software keyboard
  // only shrinks the visual viewport — the layout viewport (and dvh) stay
  // put — so without this the browser pans the page to reveal the composer
  // and buries the panel header off the top. Same trick as CreatePost.
  // Only applies below sm, where the panel is viewport-fixed.
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    const panel = panelRef.current
    if (!vv || !panel) return
    const mobile = window.matchMedia('(max-width: 639px)')
    const sync = () => {
      if (!mobile.matches) {
        panel.style.top = ''
        panel.style.maxHeight = ''
        return
      }
      panel.style.top = `${vv.offsetTop + 80}px`
      // Keyboard open: the dock is hidden behind it, so a small gap suffices.
      // Closed: hold the 11rem clearance the CSS height uses (dock + margin).
      panel.style.maxHeight = `${vv.height - (vv.height < window.innerHeight ? 96 : 176)}px`
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      panel.style.top = ''
      panel.style.maxHeight = ''
    }
  }, [open])

  // Chat badge = pending invites + unread room messages, all from the WS
  // session (client-side only) — nothing is persisted server-side.
  const inviteCount = chat?.incoming.length ?? 0
  const unreadCount = chat
    ? [...chat.rooms.values()].reduce((sum, room) => sum + room.unread, 0)
    : 0
  const badgeCount = inviteCount + unreadCount

  const active = chat?.activeRoom ? chat.rooms.get(chat.activeRoom) : undefined

  const toggle = () => chat?.setMenuOpen(!open)

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        onClick={toggle}
        aria-label="Chat"
        title="Chat"
        aria-expanded={open}
        className={`glass relative flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
          open ? 'text-accent-600' : 'text-neutral-700 hover:text-accent-600'
        }`}
      >
        <span className="relative">
          <ChatIcon className="h-6 w-6" />
          {badgeCount ? (
            <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : null}
        </span>
      </button>

      {/* Below sm the pill is too narrow to anchor a panel — pin it to the
          viewport edges instead (same inset as the header/search dropdown).
          From sm up it hugs the pill's right edge at a fixed width. The
          roster sizes to its content like the notifications dropdown; an
          open room takes the full capped height so the composer stays
          pinned while the message list scrolls. The 11rem clearance keeps
          the panel above the floating dock. */}
      {open && (
        <div
          ref={panelRef}
          className={`glass-pop motion-safe:animate-menu-pop fixed inset-x-4 top-20 z-20 flex origin-top flex-col overflow-hidden rounded-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:origin-top-right ${
            active ? 'h-[min(70vh,calc(100dvh-11rem))]' : 'max-h-[min(70vh,calc(100dvh-11rem))]'
          }`}
        >
          {active ? (
            <ChatRoom room={active} />
          ) : loaded ? (
            <ChatClient mutuals={mutuals} />
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

'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'

import { getChatMutuals } from '@/actions/chat'
import type { MutualsPage } from '@/lib/mutuals'

import { Avatar } from './Avatar'
import { Spinner } from './Spinner'
import { useChat } from './chat/ChatProvider'
import { pairKey } from './chat/ChatRoom'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

// Horizontal strip of mutual follows above the home tab bar. Presence comes
// from the chat socket — online mutuals sort first with an emerald dot, the
// rest show grey. The roster is paged server-side; a "show more" tile at the
// end of the rail appends the next page. Hidden only when the user has no
// mutuals at all.
export function OnlineMutuals({ mutuals }: { mutuals: MutualsPage }) {
  const chat = useChat()
  const railRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const [items, setItems] = useState(mutuals.items)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(mutuals.hasMore)
  const [total, setTotal] = useState(mutuals.total)
  const [pending, startTransition] = useTransition()

  // A fresh first page from a server re-render replaces local pages — the
  // roster is small enough that reloading the tail is cheaper than merging.
  const [prevMutuals, setPrevMutuals] = useState(mutuals)
  if (prevMutuals !== mutuals) {
    setPrevMutuals(mutuals)
    setItems(mutuals.items)
    setPage(1)
    setHasMore(mutuals.hasMore)
    setTotal(mutuals.total)
  }

  useEffect(() => {
    const rail = railRef.current
    if (!rail || items.length === 0) return
    const updateEdges = () => {
      setCanScrollLeft(rail.scrollLeft > 4)
      // Keep the arrow alive while a next page can still be fetched — the
      // sentinel tile sits past the current scroll end.
      setCanScrollRight(hasMore || rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4)
    }
    updateEdges()
    rail.addEventListener('scroll', updateEdges, { passive: true })
    window.addEventListener('resize', updateEdges)
    return () => {
      rail.removeEventListener('scroll', updateEdges)
      window.removeEventListener('resize', updateEdges)
    }
  }, [items.length, hasMore])

  if (items.length === 0) return null

  const online = new Set(
    chat?.enabled && chat.status === 'online' ? chat.online.map((u) => u.id) : [],
  )
  const onlineCount = items.filter((u) => online.has(u.id)).length
  const sorted = [...items].sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)))
  const remaining = Math.max(total - items.length, 0)

  const loadMore = () => {
    if (pending || !hasMore) return
    startTransition(async () => {
      const next = page + 1
      const res = await getChatMutuals(next)
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...res.items.filter((m) => !seen.has(m.id))]
      })
      setPage(next)
      setHasMore(res.hasMore)
      setTotal(res.total)
    })
  }

  return (
    <div className="glass mb-3 rounded-3xl p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Mutuals
        {onlineCount > 0 && (
          <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
            {onlineCount} online
          </span>
        )}
      </p>
      <div className="relative">
        <div
          ref={railRef}
          className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sorted.map((user) => {
            const isOnline = online.has(user.id)
            const waiting =
              isOnline && chat != null && chat.outgoing.has(pairKey(chat.self?.id ?? 0, user.id))
            const content = (
              <>
                <span className={`relative ${isOnline ? '' : 'opacity-60'}`}>
                  <Avatar src={user.avatarUrl} name={user.name} size="lg" />
                  <span
                    className={`absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white ${
                      isOnline ? 'bg-emerald-500' : 'bg-neutral-300'
                    } ${waiting ? 'animate-pulse' : ''}`}
                  />
                </span>
                <span className="w-full truncate text-center text-xs leading-tight text-neutral-600">
                  {user.name.split(' ')[0]}
                </span>
              </>
            )
            const itemClass = 'flex w-20 shrink-0 flex-col items-center gap-1.5'
            // Online mutuals get a chat invite (the peer must accept); offline
            // ones just link to their profile.
            return isOnline && chat ? (
              <button
                key={user.id}
                type="button"
                disabled={waiting}
                title={waiting ? 'Waiting for them to accept…' : `Ask ${user.name} to chat`}
                onClick={() => chat.invite(user.id)}
                className={`${itemClass} disabled:opacity-60`}
              >
                {content}
              </button>
            ) : (
              <Link key={user.id} href={`/profile/${user.username}`} className={itemClass}>
                {content}
              </Link>
            )
          })}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={pending}
              className="flex w-20 shrink-0 flex-col items-center gap-1.5 disabled:opacity-60"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/60 text-sm font-semibold text-neutral-600 ring-1 ring-neutral-200 transition hover:ring-accent-300 dark:bg-white/5 dark:text-neutral-300 dark:ring-white/10">
                {pending ? <Spinner className="h-5 w-5" /> : `+${remaining}`}
              </span>
              <span className="w-full truncate text-center text-xs leading-tight text-neutral-600">
                Show more
              </span>
            </button>
          )}
        </div>
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() =>
              railRef.current?.scrollBy({
                left: -railRef.current.clientWidth * 0.85,
                behavior: 'smooth',
              })
            }
            className="glass absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() =>
              railRef.current?.scrollBy({
                left: railRef.current.clientWidth * 0.85,
                behavior: 'smooth',
              })
            }
            className="glass absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

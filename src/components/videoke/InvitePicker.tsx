'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { inviteToVideoke } from '@/actions/videoke'
import { toast } from '@/lib/events'
import type { MutualHead } from '@/lib/mutuals'
import type { VideokeRoomData } from '@/lib/videoke'

import { Avatar } from '../Avatar'
import { useChat } from '../chat/ChatProvider'
import { PlusIcon, SearchIcon } from '../icons'
import { useSheetDragClose } from '../useSheetDrag'

const PAGE = 8
const CLOSE_MS = 300

// Mutual-follow invite sheet — bottom sheet on mobile, centered dialog on
// desktop (same chrome as the app's other sheets). Online mutuals sort first
// (presence from the shared chat socket); anyone not yet a member or invitee
// is invitable and the server enforces the mutual-follow rule.
export const InvitePicker = memo(function InvitePicker({
  room,
  mutuals,
  onRoom,
}: {
  room: VideokeRoomData
  mutuals: MutualHead[]
  onRoom: (room: VideokeRoomData) => void
}) {
  const chat = useChat()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [inviting, setInviting] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, CLOSE_MS)
  }, [closing])

  const sheetDrag = useSheetDragClose(close)

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

  const taken = useMemo(
    () => new Set([...room.members.map((m) => m.id), ...room.invites.map((i) => i.user.id)]),
    [room],
  )
  const online = useMemo(() => new Set(chat?.online.map((u) => u.id) ?? []), [chat?.online])
  const candidates = useMemo(
    () =>
      [...mutuals]
        .filter((m) => !taken.has(m.id))
        .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id))),
    [mutuals, taken, online],
  )

  const q = query.trim().toLowerCase()
  const filtered = q
    ? candidates.filter(
        (m) => m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q),
      )
    : candidates
  const visible = filtered.slice(0, shown)
  const remaining = filtered.length - visible.length

  const invite = (id: number) => {
    setInviting(id)
    inviteToVideoke(room.id, [id]).then((res) => {
      setInviting(null)
      if (!res.ok) toast(res.error)
      else if (res.room) onRoom(res.room)
    })
  }

  const onQuery = (v: string) => {
    setQuery(v)
    setShown(PAGE)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-accent-soft flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
      >
        <PlusIcon className="h-3 w-3" />
        Invite mutuals
      </button>

      {/* Sheet — portaled so glass card backdrop-filters can't trap it */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
            <div
              className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
                closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
              }`}
              onClick={close}
            />
            <div
              {...sheetDrag}
              className={`glass relative flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px] ${
                closing
                  ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
                  : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
              }`}
            >
              {/* iOS sheet drag handle (mobile) */}
              <div
                data-sheet-handle
                className="mx-auto mb-1 mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
              />

              {/* Header: Cancel / title / spacer */}
              <div
                data-sheet-handle
                className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 pb-3 pt-1 sm:pt-3 dark:border-white/10"
              >
                <button
                  type="button"
                  onClick={close}
                  className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  Cancel
                </button>
                <h2 className="text-[15px] font-semibold">Invite mutuals</h2>
                <span className="w-14" />
              </div>

              {/* Search */}
              <div className="shrink-0 px-5 pt-3">
                <div className="flex items-center gap-2 rounded-full bg-black/5 px-4 py-2 focus-within:ring-2 focus-within:ring-accent-500/40 dark:bg-white/10">
                  <SearchIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                  <input
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    placeholder="Search mutuals…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                  />
                </div>
              </div>

              {/* Scrollable mutual list */}
              <div
                data-sheet-scroll
                className="min-h-0 flex-1 overflow-y-auto overscroll-none p-5 pt-3"
              >
                {filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-500">
                    {q ? 'No mutuals match your search.' : 'All your mutuals are already here.'}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {visible.map((user) => {
                      const isOnline = online.has(user.id)
                      return (
                        <li
                          key={user.id}
                          className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                        >
                          <span className="relative shrink-0">
                            <Avatar src={user.avatarUrl} name={user.name} size="md" />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-neutral-900 ${
                                isOnline ? 'bg-emerald-500' : 'bg-neutral-300'
                              }`}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {user.name}
                            </span>
                            <span className="block truncate text-xs text-neutral-500">
                              @{user.username} · {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled={inviting === user.id}
                            onClick={() => invite(user.id)}
                            className="btn-primary shrink-0 rounded-full px-4 py-1.5 text-sm"
                          >
                            {inviting === user.id ? 'Inviting…' : 'Invite'}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setShown((s) => s + PAGE)}
                    className="mt-2 w-full rounded-xl px-2.5 py-2 text-xs font-semibold text-accent-600 transition-colors hover:bg-accent-500/10"
                  >
                    Show {Math.min(remaining, PAGE)} more · {remaining} left
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
})

'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { Avatar } from '../Avatar'
import { useChat } from './ChatProvider'

// App-wide "they accepted" toast — fires when a peer accepts one of our
// outgoing invites, on any page. Auto-dismisses; Open jumps into the room.
export function AcceptedBanner() {
  const chat = useChat()
  const router = useRouter()
  const pathname = usePathname()
  const alert = chat?.acceptedAlert ?? null

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => chat?.clearAcceptedAlert(), 6_000)
    return () => clearTimeout(timer)
  }, [alert, chat])

  if (!chat || !alert) return null

  const onOpen = () => {
    chat.openRoom(alert.room)
    chat.clearAcceptedAlert()
    if (pathname !== '/chat') router.push('/chat')
  }

  return (
    <div className="fixed inset-x-0 bottom-40 z-50 flex justify-center px-4">
      <div
        role="status"
        className="glass motion-safe:animate-toast-in flex w-full max-w-sm items-center gap-3 rounded-2xl p-3 shadow-lg"
      >
        <Avatar src={alert.user.avatarUrl} name={alert.user.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{alert.user.name}</p>
          <p className="text-xs text-neutral-500">accepted your chat invite</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-700 dark:bg-accent-200 dark:text-accent-900 dark:hover:bg-accent-100"
        >
          Open
        </button>
        <button
          type="button"
          onClick={chat.clearAcceptedAlert}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Later
        </button>
      </div>
    </div>
  )
}

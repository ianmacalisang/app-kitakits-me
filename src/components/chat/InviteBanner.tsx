'use client'

import { usePathname, useRouter } from 'next/navigation'

import { Avatar } from '../Avatar'
import { useChat } from './ChatProvider'

// App-wide incoming-invite surface — rendered inside ChatProvider so a ping
// reaches the user on any page, not just /chat. Accepting joins the room and
// navigates to the chat page.
export function InviteBanner() {
  const chat = useChat()
  const router = useRouter()
  const pathname = usePathname()

  if (!chat || chat.incoming.length === 0) return null

  const invite = chat.incoming[chat.incoming.length - 1]

  const onAccept = () => {
    chat.accept(invite.room)
    chat.openRoom(invite.room)
    if (pathname !== '/chat') router.push('/chat')
  }

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div
        role="alert"
        className="glass motion-safe:animate-toast-in flex w-full max-w-sm items-center gap-3 rounded-2xl p-3 shadow-lg"
      >
        <Avatar src={invite.from.avatarUrl} name={invite.from.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{invite.from.name}</p>
          <p className="text-xs text-neutral-500">wants to chat</p>
        </div>
        <button
          type="button"
          onClick={onAccept}
          className="rounded-full bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-700"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => chat.decline(invite.room)}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800"
        >
          Decline
        </button>
      </div>
    </div>
  )
}

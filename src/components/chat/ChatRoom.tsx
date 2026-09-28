'use client'

import { useEffect, useRef, useState } from 'react'

import { Avatar } from '../Avatar'
import { ChevronLeftIcon, SendIcon, XIcon } from '../icons'
import { useChat, type RoomState } from './ChatProvider'

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// Live ephemeral conversation — messages exist only in WS-server memory and
// in this component's provider state; nothing is stored server-side.
export function ChatRoom({ room }: { room: RoomState }) {
  const chat = useChat()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const peer = room.peer
  const selfId = chat?.self?.id
  const peerOnline = peer != null && chat?.online.some((u) => u.id === peer.id)
  const lastTypingSentRef = useRef(0)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [room.messages.length, room.peerTyping])

  if (!chat) return null

  const submit = () => {
    const body = draft.trim()
    if (!body || room.ended) return
    chat.send(room.key, body)
    setDraft('')
  }

  const onDraftChange = (value: string) => {
    setDraft(value)
    // Typing pings are fire-and-forget — the peer clears them ~3s after the
    // last one, so a cleared input just fades out rather than needing an
    // explicit "stopped" frame.
    const now = Date.now()
    if (value.trim() && !room.ended && now - lastTypingSentRef.current > 1_200) {
      lastTypingSentRef.current = now
      chat.typing(room.key)
    }
  }

  const onLeave = () => {
    chat.leave(room.key)
    chat.openRoom(null)
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col overflow-hidden rounded-3xl glass">
      <div className="flex items-center gap-3 border-b border-neutral-200/60 px-4 py-3">
        <button
          type="button"
          onClick={() => chat.openRoom(null)}
          aria-label="Back to chats"
          className="-ml-1 rounded-full p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        {peer && <Avatar src={peer.avatarUrl} name={peer.name} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{peer?.name ?? 'Chat'}</p>
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                room.ended
                  ? 'bg-neutral-300'
                  : room.peerInRoom || peerOnline
                    ? 'bg-emerald-500'
                    : 'bg-neutral-300'
              }`}
            />
            {room.ended
              ? 'Chat ended'
              : room.peerTyping
                ? 'typing…'
                : room.peerInRoom
                  ? 'In this chat'
                  : peerOnline
                    ? 'Online'
                    : 'Offline'}
          </p>
        </div>
        {!room.ended && (
          <button
            type="button"
            onClick={onLeave}
            aria-label="Leave chat"
            title="Leave chat"
            className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
        {room.messages.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-400">
            Say hi to {peer?.name?.split(' ')[0] ?? 'them'} — messages disappear when the chat ends.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {room.messages.map((msg) => {
            const mine = msg.from === selfId
            return (
              <li key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words ${
                    mine
                      ? 'rounded-br-md bg-accent-600 text-white'
                      : 'rounded-bl-md bg-neutral-100 text-neutral-900'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                  <p
                    className={`mt-0.5 text-right text-[10px] ${
                      mine ? 'text-white/60' : 'text-neutral-400'
                    }`}
                  >
                    {timeOf(msg.ts)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
        {room.peerTyping && !room.ended && (
          <div className="mt-1.5 flex justify-start" aria-live="polite">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-neutral-100 px-3.5 py-2.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-neutral-400 motion-safe:animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {room.ended ? (
        <p className="border-t border-neutral-200/60 px-4 py-3 text-center text-xs text-neutral-400">
          This chat has ended and its messages are gone.
        </p>
      ) : (
        <form
          className="flex items-center gap-2 border-t border-neutral-200/60 px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={
              room.peerInRoom || peerOnline ? 'Message…' : 'They left — messages wait for them'
            }
            maxLength={2000}
            className="min-w-0 flex-1 rounded-full bg-neutral-100 px-4 py-2.5 text-sm outline-none transition placeholder:text-neutral-400 focus:ring-2 focus:ring-accent-500/40"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="rounded-full bg-accent-600 p-2.5 text-white transition hover:bg-accent-700 disabled:opacity-40"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  )
}

export { pairKey }

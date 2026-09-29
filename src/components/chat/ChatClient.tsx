'use client'

import type { MutualHead } from '@/lib/mutuals'

import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { Spinner } from '../Spinner'
import { ChatIcon } from '../icons'
import { useChat } from './ChatProvider'
import { pairKey } from './ChatRoom'

// Chat dropdown body — lists all mutual follows (online first, with status
// dots) and live rooms inside the panel; selecting a room swaps the panel to
// the conversation. Presence comes from ChatProvider's in-memory WS session;
// the mutual roster is fetched by ChatMenu when the dropdown opens.
export function ChatClient({ mutuals }: { mutuals: MutualHead[] }) {
  const chat = useChat()

  if (!chat) return null

  if (!chat.enabled) {
    return (
      <EmptyState
        icon={<ChatIcon />}
        title="Chat is not available"
        message="Live chat isn't configured on this deployment."
        compact
        plain
      />
    )
  }

  const selfId = chat.self?.id
  const roomList = [...chat.rooms.values()].sort(
    (a, b) => (b.messages.at(-1)?.ts ?? 0) - (a.messages.at(-1)?.ts ?? 0),
  )
  const roomPeerIds = new Set(roomList.map((r) => r.peer?.id).filter(Boolean))
  const onlineIds = new Set(chat.online.map((u) => u.id))

  // All mutuals, online first. Only online ones without a live room can be
  // invited — everyone else just shows their status.
  const roster = [...mutuals].sort(
    (a, b) => Number(onlineIds.has(b.id)) - Number(onlineIds.has(a.id)),
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-neutral-200/60 px-4 py-3 dark:border-white/10">
        <h2 className="text-sm font-bold">Quick Chat</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Log out, and your chats are gone.</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-3">
          {chat.status === 'connecting' && (
            <div className="flex items-center gap-2.5 rounded-xl bg-white/60 px-3 py-2.5 text-xs text-neutral-500 dark:bg-white/5">
              <Spinner className="h-3.5 w-3.5 text-neutral-400" /> Connecting to chat…
            </div>
          )}
          {chat.status === 'offline' && (
            <div className="rounded-xl bg-white/60 px-3 py-2.5 text-xs text-neutral-500 dark:bg-white/5">
              Chat is offline — retrying automatically.
            </div>
          )}

          {roomList.length > 0 && (
            <section className="flex flex-col gap-1">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Conversations
              </h3>
              <ul className="divide-y divide-neutral-200/60 overflow-hidden rounded-2xl bg-white/60 dark:divide-white/10 dark:bg-white/5">
                {roomList.map((room) => {
                  const peer = room.peer
                  const last = room.messages.at(-1)
                  const peerOnline = peer != null && chat.online.some((u) => u.id === peer.id)
                  return (
                    <li key={room.key}>
                      <button
                        type="button"
                        onClick={() => {
                          chat.join(room.key)
                          chat.openRoom(room.key)
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/60 dark:hover:bg-white/10"
                      >
                        <span className="relative shrink-0">
                          <Avatar src={peer?.avatarUrl} name={peer?.name ?? '?'} size="md" />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-neutral-900 ${
                              room.peerInRoom || peerOnline ? 'bg-emerald-500' : 'bg-neutral-300'
                            }`}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {peer?.name ?? 'Chat'}
                          </span>
                          <span
                            className={`block truncate text-xs ${
                              room.unread > 0
                                ? 'font-semibold text-neutral-900 dark:text-neutral-100'
                                : 'text-neutral-500'
                            }`}
                          >
                            {room.ended
                              ? 'Chat ended'
                              : last
                                ? `${last.from === selfId ? 'You: ' : ''}${last.body}`
                                : 'No messages yet'}
                          </span>
                        </span>
                        {room.unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                            {room.unread > 99 ? '99+' : room.unread}
                          </span>
                        )}
                        {room.peerInRoom && (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            Live
                          </span>
                        )}
                        {!room.peerInRoom && room.peerLeftAt > 0 && !room.ended && (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                            Left
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-1">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Mutual follows ({roster.length})
            </h3>
            {roster.length === 0 ? (
              <EmptyState
                icon={<ChatIcon />}
                title="No mutuals yet"
                message="Live chat is available with mutual follows who are currently online."
                compact
                plain
              />
            ) : (
              <ul className="divide-y divide-neutral-200/60 overflow-hidden rounded-2xl bg-white/60 dark:divide-white/10 dark:bg-white/5">
                {roster.map((user) => {
                  const isOnline = onlineIds.has(user.id)
                  const pending = chat.outgoing.has(pairKey(selfId ?? 0, user.id))
                  // Room key is pairKey(self, peer) — same as the server.
                  const roomKey = roomPeerIds.has(user.id) ? pairKey(selfId ?? 0, user.id) : null
                  return (
                    <li
                      key={user.id}
                      onClick={
                        roomKey
                          ? () => {
                              chat.join(roomKey)
                              chat.openRoom(roomKey)
                            }
                          : undefined
                      }
                      role={roomKey ? 'button' : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 ${isOnline ? '' : 'opacity-60'} ${
                        roomKey
                          ? 'cursor-pointer transition hover:bg-white/60 dark:hover:bg-white/10'
                          : ''
                      }`}
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
                        <span className="block truncate text-sm font-semibold">{user.name}</span>
                        <span className="block truncate text-xs text-neutral-500">
                          @{user.username} · {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </span>
                      {isOnline && !roomKey && (
                        <button
                          type="button"
                          disabled={pending || chat.status !== 'online'}
                          onClick={() => chat.invite(user.id)}
                          className="shrink-0 rounded-full bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-700 disabled:opacity-50 dark:bg-accent-200 dark:text-accent-900 dark:hover:bg-accent-100"
                        >
                          {pending ? 'Waiting…' : 'Chat'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

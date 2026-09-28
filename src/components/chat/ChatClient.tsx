'use client'

import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { Spinner } from '../Spinner'
import { ChatIcon, LockIcon } from '../icons'
import { useChat } from './ChatProvider'
import { ChatRoom, pairKey } from './ChatRoom'

// /chat body — lists online mutual follows and live rooms; selecting one swaps
// the list for the conversation (single-pane, mobile-first like the rest of
// the app). All state comes from ChatProvider's in-memory WS session.
export function ChatClient() {
  const chat = useChat()

  if (!chat) return null

  if (!chat.enabled) {
    return (
      <EmptyState
        icon={<ChatIcon />}
        title="Chat is not available"
        message="Live chat isn't configured on this deployment."
      />
    )
  }

  const active = chat.activeRoom ? chat.rooms.get(chat.activeRoom) : undefined
  if (active) return <ChatRoom room={active} />

  const selfId = chat.self?.id
  const roomList = [...chat.rooms.values()].sort(
    (a, b) => (b.messages.at(-1)?.ts ?? 0) - (a.messages.at(-1)?.ts ?? 0),
  )
  const roomPeerIds = new Set(roomList.map((r) => r.peer?.id).filter(Boolean))

  // Mutuals who are online but don't have a room yet — invite targets.
  const inviteable = chat.online.filter((u) => u.id !== selfId && !roomPeerIds.has(u.id))

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-neutral-400">
        <LockIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        Chats aren’t saved — messages disappear when the conversation ends, and the other person has
        to accept your invite before a chat starts.
      </p>

      {chat.status === 'connecting' && (
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-neutral-500">
          <Spinner className="h-4 w-4 text-neutral-400" /> Connecting to chat…
        </div>
      )}
      {chat.status === 'offline' && (
        <div className="glass rounded-2xl px-4 py-3 text-sm text-neutral-500">
          Chat is offline — retrying automatically.
        </div>
      )}

      {roomList.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Conversations
          </h2>
          <ul className="glass divide-y divide-neutral-200/60 overflow-hidden rounded-3xl dark:divide-white/10">
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
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-neutral-50/60"
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
                      <span className="block truncate text-xs text-neutral-500">
                        {room.ended
                          ? 'Chat ended'
                          : last
                            ? `${last.from === selfId ? 'You: ' : ''}${last.body}`
                            : 'No messages yet'}
                      </span>
                    </span>
                    {room.peerInRoom && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        Live
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Online mutual follows ({inviteable.length})
        </h2>
        {inviteable.length === 0 ? (
          <EmptyState
            icon={<ChatIcon />}
            title={chat.status === 'online' ? 'No mutuals online' : 'Looking for mutuals…'}
            message="You can only live-chat people you follow who also follow you back — and only while they're online."
            compact
          />
        ) : (
          <ul className="glass divide-y divide-neutral-200/60 overflow-hidden rounded-3xl dark:divide-white/10">
            {inviteable.map((user) => {
              const pending = chat.outgoing.has(pairKey(selfId ?? 0, user.id))
              return (
                <li key={user.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="relative shrink-0">
                    <Avatar src={user.avatarUrl} name={user.name} size="md" />
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-neutral-900" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{user.name}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      @{user.username}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending || chat.status !== 'online'}
                    onClick={() => chat.invite(user.id)}
                    className="shrink-0 rounded-full bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-700 disabled:opacity-50 dark:bg-accent-200 dark:text-accent-900 dark:hover:bg-accent-100"
                  >
                    {pending ? 'Waiting…' : 'Chat'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

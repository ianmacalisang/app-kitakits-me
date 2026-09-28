'use client'

import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { Spinner } from '../Spinner'
import { ChatIcon, LockIcon, UsersIcon } from '../icons'
import { useChat } from './ChatProvider'
import { ChatRoom, pairKey } from './ChatRoom'

const STEPS = [
  {
    icon: UsersIcon,
    label: 'A mutual comes online',
    hint: 'Chat only works with mutual follows who are online now',
  },
  {
    icon: ChatIcon,
    label: 'They accept your invite',
    hint: 'Nothing starts until the other person says yes',
  },
  {
    icon: LockIcon,
    label: 'Nothing is stored',
    hint: 'Chats vanish when they end — or when you log out',
  },
]

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
      <div>
        <h1 className="text-xl font-bold">Quick Chat</h1>
        <p className="mt-1 text-sm text-neutral-500">Log out, and your chats are gone.</p>
      </div>

      {/* How it works — three steps on a dashed timeline; the ring on each
          disc keeps the connector hidden behind it. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          How it works
        </h2>
        <ol className="glass relative grid grid-cols-3 gap-1 rounded-3xl px-3 pb-5 pt-4">
          <span
            aria-hidden
            className="motion-safe:animate-dash-flow absolute left-[16.67%] right-[16.67%] top-9 h-px"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to right, var(--color-accent-400) 0 6px, transparent 6px 12px)',
            }}
          />
          {STEPS.map(({ icon: Icon, label, hint }) => (
            <li key={label} className="relative flex flex-col items-center gap-2 text-center">
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-600 to-accent-900 text-white shadow-md shadow-accent-900/25 ring-4 ring-white/80 dark:ring-neutral-900">
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold leading-tight text-neutral-800 dark:text-neutral-100">
                  {label}
                </span>
                <span className="text-[10px] leading-snug text-neutral-500 dark:text-neutral-400">
                  {hint}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

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
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/60"
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

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Online mutual follows ({inviteable.length})
        </h2>
        {inviteable.length === 0 ? (
          <EmptyState
            icon={<ChatIcon />}
            title={chat.status === 'online' ? 'No mutuals online' : 'Looking for mutuals…'}
            message="Live chat is available with mutual follows who are currently online."
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

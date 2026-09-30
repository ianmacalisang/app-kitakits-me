'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { getChatTicket } from '@/actions/chat'
import { LIVE_EVENT, toast } from '@/lib/events'

export interface ChatUser {
  id: number
  name: string
  username: string
  avatarUrl: string | null
}

export interface ChatMessage {
  id: number
  from: number
  body: string
  ts: number
}

export interface RoomState {
  key: string
  peer: ChatUser | null
  messages: ChatMessage[]
  peerInRoom: boolean
  peerTyping: boolean
  /** Last time the peer left (0 = they're here). Drives the "left" notice. */
  peerLeftAt: number
  /** Peer messages received while the room wasn't open. */
  unread: number
  ended: boolean
}

export interface PendingInvite {
  room: string
  from: ChatUser
}

type ChatStatus = 'disabled' | 'connecting' | 'online' | 'offline'

interface ChatContextValue {
  enabled: boolean
  status: ChatStatus
  self: ChatUser | null
  online: ChatUser[]
  rooms: Map<string, RoomState>
  incoming: PendingInvite[]
  outgoing: Map<string, ChatUser>
  activeRoom: string | null
  /** Set when a peer accepts one of our outgoing invites — drives a toast. */
  acceptedAlert: { room: string; user: ChatUser } | null
  /** Chat dropdown visibility — kept here so banners can open it app-wide. */
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  invite: (to: number) => void
  accept: (room: string) => void
  decline: (room: string) => void
  join: (room: string) => void
  send: (room: string, body: string) => void
  typing: (room: string) => void
  leave: (room: string) => void
  openRoom: (room: string | null) => void
  clearAcceptedAlert: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export const useChat = () => useContext(ChatContext)

const WS_URL = process.env.NEXT_PUBLIC_CHAT_WS_URL ?? ''

// Owns the single WebSocket connection for the whole app session. Mounted in
// the (app) layout above AppNav so invites can ping the user on any page.
// All state lives in this client boundary — nothing is persisted server-side.
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const enabled = Boolean(WS_URL)

  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // One auto-expiry timer per room for the "peer is typing" flag — the wire
  // only carries "started typing", the client derives the stop.
  const typingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const unmountedRef = useRef(false)
  // Mutable mirrors used inside the WS handler — state values would churn
  // the connect effect's deps and force a reconnect on every change.
  const selfIdRef = useRef<number | null>(null)
  const activeRoomRef = useRef<string | null>(null)
  // Mirror of `outgoing` for the same reason — the handler reads it to tell
  // "accepted invite" apart from a plain rejoin on `joined`.
  const outgoingRef = useRef(new Map<string, ChatUser>())

  const [status, setStatus] = useState<ChatStatus>(enabled ? 'connecting' : 'disabled')
  const [self, setSelf] = useState<ChatUser | null>(null)
  const [onlineMap, setOnlineMap] = useState<Map<number, ChatUser>>(new Map())
  const [rooms, setRooms] = useState<Map<string, RoomState>>(new Map())
  const [incoming, setIncoming] = useState<PendingInvite[]>([])
  const [outgoing, setOutgoing] = useState<Map<string, ChatUser>>(new Map())
  const [activeRoom, setActiveRoom] = useState<string | null>(null)
  const [menuOpen, setMenuOpenState] = useState(false)
  const [acceptedAlert, setAcceptedAlert] = useState<{
    room: string
    user: ChatUser
  } | null>(null)

  const patchRoom = useCallback((key: string, patch: Partial<RoomState>) => {
    setRooms((prev) => {
      const room = prev.get(key)
      if (!room) return prev
      const next = new Map(prev)
      next.set(key, { ...room, ...patch })
      return next
    })
  }, [])

  const clearTyping = useCallback(
    (key: string) => {
      const timer = typingTimersRef.current.get(key)
      if (timer) {
        clearTimeout(timer)
        typingTimersRef.current.delete(key)
      }
      patchRoom(key, { peerTyping: false })
    },
    [patchRoom],
  )

  const handleMessage = useCallback(
    (raw: MessageEvent) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(String(raw.data))
      } catch {
        return
      }

      switch (msg.type) {
        case 'auth:ok': {
          retriesRef.current = 0
          setStatus('online')
          setSelf(msg.self as ChatUser)
          selfIdRef.current = (msg.self as ChatUser).id
          setOnlineMap(new Map((msg.online as ChatUser[]).map((u) => [u.id, u])))
          break
        }
        case 'presence:join': {
          const user = msg.user as ChatUser
          setOnlineMap((prev) => new Map(prev).set(user.id, user))
          break
        }
        case 'presence:leave': {
          const id = Number(msg.userId)
          setOnlineMap((prev) => {
            if (!prev.has(id)) return prev
            const next = new Map(prev)
            next.delete(id)
            return next
          })
          break
        }
        case 'invite': {
          const invite = { room: String(msg.room), from: msg.from as ChatUser }
          setIncoming((prev) =>
            prev.some((i) => i.room === invite.room) ? prev : [...prev, invite],
          )
          break
        }
        case 'invite:sent': {
          const room = String(msg.room)
          const next = new Map(outgoingRef.current).set(room, msg.to as ChatUser)
          outgoingRef.current = next
          setOutgoing(next)
          break
        }
        case 'invite:declined':
        case 'invite:expired':
        case 'invite:cancelled': {
          const room = String(msg.room)
          setIncoming((prev) => prev.filter((i) => i.room !== room))
          if (outgoingRef.current.has(room)) {
            const next = new Map(outgoingRef.current)
            next.delete(room)
            outgoingRef.current = next
            setOutgoing(next)
          }
          break
        }
        case 'joined': {
          const key = String(msg.room)
          const incomingPeer = msg.peer as ChatUser | null
          setRooms((prev) => {
            const next = new Map(prev)
            const existing = next.get(key)
            // A bare {id} placeholder (peer offline) must not clobber real
            // info a previous `joined` already gave us.
            const peer = incomingPeer?.name ? incomingPeer : (existing?.peer ?? incomingPeer)
            const history = (msg.history as ChatMessage[]) ?? existing?.messages ?? []
            // History replayed on join/reconnect — entries we haven't seen
            // that came from the peer count as unread (unless looking now).
            const seen = new Set((existing?.messages ?? []).map((m) => m.id))
            const newUnread =
              key === activeRoomRef.current
                ? 0
                : history.filter((m) => !seen.has(m.id) && m.from !== selfIdRef.current).length
            next.set(key, {
              key,
              peer,
              messages: history,
              // Server reports whether the peer actually has sockets in the
              // room; default true so an older server build still works.
              peerInRoom: msg.peerIn !== false,
              peerTyping: false,
              peerLeftAt: msg.peerIn === false ? Date.now() : 0,
              unread: newUnread,
              ended: false,
            })
            return next
          })
          setIncoming((prev) => prev.filter((i) => i.room !== key))
          // `joined` for a room we still have a pending outgoing invite on =
          // the peer just accepted it. Surface an alert unless we're already
          // looking at that room. (Stale entries can't false-positive: the
          // entry is deleted here on the first join and invites die with it.)
          const acceptedBy = outgoingRef.current.get(key)
          if (acceptedBy) {
            const next = new Map(outgoingRef.current)
            next.delete(key)
            outgoingRef.current = next
            setOutgoing(next)
            if (key !== activeRoomRef.current) {
              const alertUser = incomingPeer?.name ? incomingPeer : acceptedBy
              setAcceptedAlert({ room: key, user: alertUser })
            }
          }
          break
        }
        case 'msg': {
          const key = String(msg.room)
          setRooms((prev) => {
            const room = prev.get(key)
            if (!room) return prev
            const entry: ChatMessage = {
              id: Number(msg.id),
              from: Number(msg.from),
              body: String(msg.body ?? ''),
              ts: Number(msg.ts ?? Date.now()),
            }
            if (room.messages.some((m) => m.id === entry.id)) return prev
            const viewing = key === activeRoomRef.current
            const fromPeer = entry.from !== selfIdRef.current
            const next = new Map(prev)
            next.set(key, {
              ...room,
              messages: [...room.messages, entry],
              unread: viewing ? 0 : room.unread + (fromPeer ? 1 : 0),
            })
            return next
          })
          // A delivered message supersedes any in-flight typing flag.
          clearTyping(key)
          break
        }
        case 'typing': {
          const key = String(msg.room)
          patchRoom(key, { peerTyping: true })
          const timers = typingTimersRef.current
          if (timers.has(key)) clearTimeout(timers.get(key))
          timers.set(
            key,
            setTimeout(() => clearTyping(key), 3_000),
          )
          break
        }
        case 'peer:joined': {
          patchRoom(String(msg.room), { peerInRoom: true, peerLeftAt: 0 })
          break
        }
        case 'peer:left': {
          patchRoom(String(msg.room), {
            peerInRoom: false,
            peerTyping: false,
            peerLeftAt: Date.now(),
          })
          break
        }
        case 'room:ended': {
          patchRoom(String(msg.room), { ended: true, peerInRoom: false, peerTyping: false })
          break
        }
        // Server-pushed live events (relayed via chat-server's /emit) — fan
        // out as a window event so badges, feeds, and video cards refresh
        // instantly without a context dependency.
        case 'badges':
        case 'feed:new':
        case 'video:status': {
          window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: msg }))
          break
        }
        case 'videoke:update': {
          window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: msg }))
          break
        }
        case 'videoke:invite': {
          window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: msg }))
          const from = typeof msg.from === 'string' && msg.from ? msg.from : 'Someone'
          const roomName =
            typeof msg.roomName === 'string' && msg.roomName ? msg.roomName : 'a videoke'
          toast(`${from} invited you to ${roomName} hangout`)
          break
        }
        case 'videoke:request': {
          window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: msg }))
          const from = typeof msg.from === 'string' && msg.from ? msg.from : 'Someone'
          const roomName =
            typeof msg.roomName === 'string' && msg.roomName ? msg.roomName : 'your videoke'
          toast(`${from} asked to join ${roomName} hangout`)
          break
        }
        case 'error': {
          // Surface server rejections (rate limit, peer went offline,
          // non-mutual) — a silently-dropped invite looks like a dead button.
          if (typeof msg.message === 'string' && msg.message) toast(msg.message)
          break
        }
      }
    },
    [patchRoom, clearTyping],
  )

  useEffect(() => {
    unmountedRef.current = false
    const typingTimers = typingTimersRef.current
    if (!enabled) return

    // Recursive connect-with-backoff loop — declared inside the effect so the
    // retry timeouts and the visibility handler share this exact instance.
    const connect = () => {
      if (unmountedRef.current) return

      getChatTicket()
        .then(({ ticket }) => {
          if (unmountedRef.current) return
          const ws = new WebSocket(WS_URL)
          wsRef.current = ws

          ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket }))
          ws.onmessage = handleMessage
          ws.onclose = () => {
            wsRef.current = null
            if (unmountedRef.current) return
            setStatus('connecting')
            setOnlineMap(new Map())
            // Pending invites die server-side the moment we go fully offline
            // and are never replayed on reconnect — keeping them would leave
            // "Waiting…" buttons disabled and Accept banners that no-op. (If a
            // second tab kept us online, re-inviting just re-acks via
            // `invite:sent`, so clearing is safe either way.)
            outgoingRef.current = new Map()
            setOutgoing(new Map())
            setIncoming([])
            setAcceptedAlert(null)
            // Keep room buffers visible across a reconnect — the server
            // replays history on `joined`, presence repopulates on auth:ok.
            setRooms((prev) => {
              const next = new Map(prev)
              for (const [key, room] of next) {
                next.set(key, { ...room, peerInRoom: false, peerTyping: false })
              }
              return next
            })
            for (const timer of typingTimersRef.current.values()) clearTimeout(timer)
            typingTimersRef.current.clear()
            const attempt = retriesRef.current++
            const delay = Math.min(30_000, 1_000 * 2 ** attempt)
            retryTimerRef.current = setTimeout(connect, delay)
          }
          ws.onerror = () => ws.close()
        })
        .catch(() => {
          if (unmountedRef.current) return
          setStatus('offline')
          const attempt = retriesRef.current++
          const delay = Math.min(30_000, 1_000 * 2 ** attempt)
          retryTimerRef.current = setTimeout(connect, delay)
        })
    }

    connect()

    const onVisible = () => {
      // Waking the tab with a dead socket reconnects immediately instead of
      // waiting out the backoff.
      if (!document.hidden && !wsRef.current) {
        retriesRef.current = 0
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        connect()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      unmountedRef.current = true
      document.removeEventListener('visibilitychange', onVisible)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      for (const timer of typingTimers.values()) clearTimeout(timer)
      typingTimers.clear()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [enabled, handleMessage])

  const send_ = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
  }, [])

  const invite = useCallback((to: number) => send_({ type: 'invite', to }), [send_])
  const accept = useCallback((room: string) => send_({ type: 'accept', room }), [send_])
  const decline = useCallback((room: string) => send_({ type: 'decline', room }), [send_])
  const join = useCallback((room: string) => send_({ type: 'join', room }), [send_])
  const send = useCallback(
    (room: string, body: string) => send_({ type: 'msg', room, body }),
    [send_],
  )
  const typing = useCallback((room: string) => send_({ type: 'typing', room }), [send_])
  const leave = useCallback((room: string) => send_({ type: 'leave', room }), [send_])
  const openRoom = useCallback(
    (room: string | null) => {
      activeRoomRef.current = room
      setActiveRoom(room)
      // Opening counts as reading.
      if (room) patchRoom(room, { unread: 0 })
    },
    [patchRoom],
  )

  // Closing the menu backs out of any open room — a hidden room would keep
  // auto-marking its messages read and the nav badge would never bump.
  const setMenuOpen = useCallback((open: boolean) => {
    if (!open) {
      activeRoomRef.current = null
      setActiveRoom(null)
    }
    setMenuOpenState(open)
  }, [])

  const clearAcceptedAlert = useCallback(() => setAcceptedAlert(null), [])

  const value: ChatContextValue = {
    enabled,
    status,
    self,
    online: [...onlineMap.values()],
    rooms,
    incoming,
    outgoing,
    activeRoom,
    acceptedAlert,
    menuOpen,
    setMenuOpen,
    invite,
    accept,
    decline,
    join,
    send,
    typing,
    leave,
    openRoom,
    clearAcceptedAlert,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

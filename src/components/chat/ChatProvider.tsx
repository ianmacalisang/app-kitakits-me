'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { getChatTicket } from '@/actions/chat'

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
  invite: (to: number) => void
  accept: (room: string) => void
  decline: (room: string) => void
  join: (room: string) => void
  send: (room: string, body: string) => void
  typing: (room: string) => void
  leave: (room: string) => void
  openRoom: (room: string | null) => void
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

  const [status, setStatus] = useState<ChatStatus>(enabled ? 'connecting' : 'disabled')
  const [self, setSelf] = useState<ChatUser | null>(null)
  const [onlineMap, setOnlineMap] = useState<Map<number, ChatUser>>(new Map())
  const [rooms, setRooms] = useState<Map<string, RoomState>>(new Map())
  const [incoming, setIncoming] = useState<PendingInvite[]>([])
  const [outgoing, setOutgoing] = useState<Map<string, ChatUser>>(new Map())
  const [activeRoom, setActiveRoom] = useState<string | null>(null)

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
          setOutgoing((prev) => new Map(prev).set(room, msg.to as ChatUser))
          break
        }
        case 'invite:declined':
        case 'invite:expired':
        case 'invite:cancelled': {
          const room = String(msg.room)
          setIncoming((prev) => prev.filter((i) => i.room !== room))
          setOutgoing((prev) => {
            if (!prev.has(room)) return prev
            const next = new Map(prev)
            next.delete(room)
            return next
          })
          break
        }
        case 'joined': {
          const key = String(msg.room)
          setRooms((prev) => {
            const next = new Map(prev)
            const existing = next.get(key)
            next.set(key, {
              key,
              peer: (msg.peer as ChatUser) ?? existing?.peer ?? null,
              messages: (msg.history as ChatMessage[]) ?? existing?.messages ?? [],
              peerInRoom: true,
              peerTyping: false,
              ended: false,
            })
            return next
          })
          setIncoming((prev) => prev.filter((i) => i.room !== key))
          setOutgoing((prev) => {
            if (!prev.has(key)) return prev
            const next = new Map(prev)
            next.delete(key)
            return next
          })
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
            const next = new Map(prev)
            next.set(key, { ...room, messages: [...room.messages, entry] })
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
          patchRoom(String(msg.room), { peerInRoom: true })
          break
        }
        case 'peer:left': {
          patchRoom(String(msg.room), { peerInRoom: false, peerTyping: false })
          break
        }
        case 'room:ended': {
          patchRoom(String(msg.room), { ended: true, peerInRoom: false, peerTyping: false })
          break
        }
        case 'error': {
          // Surface server rejections as a toast-style status on the room if
          // it exists — malformed/forbidden cases simply get ignored.
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
  const openRoom = useCallback((room: string | null) => setActiveRoom(room), [])

  const value: ChatContextValue = {
    enabled,
    status,
    self,
    online: [...onlineMap.values()],
    rooms,
    incoming,
    outgoing,
    activeRoom,
    invite,
    accept,
    decline,
    join,
    send,
    typing,
    leave,
    openRoom,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

/**
 * Kitakits ephemeral chat — standalone WebSocket service.
 *
 * Holds ALL chat state in process memory: presence, pending invites, room
 * membership, and a small per-room replay buffer. Nothing touches a database —
 * clients authenticate with a short-lived signed "chat ticket" minted by the
 * main app's getChatTicket() server action (HS256 JWT carrying the user's
 * identity + mutual-follow ids). Run it next to the Next app as a second
 * service (Coolify/Traefik upgrades wss:// natively).
 *
 * Env:
 *   WS_PORT            listen port (default 3001)
 *   CHAT_TICKET_SECRET HS256 secret shared with the app (falls back to PAYLOAD_SECRET)
 *   ALLOWED_ORIGIN     comma-separated browser origins allowed to upgrade
 */

import http from 'node:http'

import { jwtVerify } from 'jose'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.WS_PORT || 3001)
const SECRET = process.env.CHAT_TICKET_SECRET || process.env.PAYLOAD_SECRET || ''
const ORIGINS = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const SECRET_BYTES = new TextEncoder().encode(SECRET)

const AUTH_TIMEOUT_MS = Number(process.env.CHAT_AUTH_TIMEOUT_MS || 5_000)
const INVITE_TTL_MS = Number(process.env.CHAT_INVITE_TTL_MS || 120_000)
const PURGE_GRACE_MS = Number(process.env.CHAT_PURGE_GRACE_MS || 60_000)
const KEEPALIVE_MS = Number(process.env.CHAT_KEEPALIVE_MS || 30_000)
const BUFFER_MAX = 100
const BODY_MAX = 2_000
const MUTUALS_MAX = 500

/** @type {Map<number, {info: object, mutuals: Set<number>, sockets: Set<import('ws').WebSocket>}>} */
const online = new Map()

/** @type {Map<string, {key: string, members: Set<number>, sockets: Map<number, Set<import('ws').WebSocket>>, left: Set<number>, buffer: object[], seq: number, purgeTimer: NodeJS.Timeout | null}>} */
const rooms = new Map()

/** @type {Map<string, {from: number, to: number, timer: NodeJS.Timeout}>} */
const pending = new Map()

const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`)

const send = (ws, msg) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

const sendToUser = (userId, msg) => {
  const entry = online.get(userId)
  if (!entry) return
  for (const ws of entry.sockets) send(ws, msg)
}

// Per-socket fixed-window buckets — in-process only, matching the app's
// lib/rate-limit approach.
const allow = (ws, key, limit, windowMs) => {
  const now = Date.now()
  if (!ws.rl) ws.rl = new Map()
  const bucket = ws.rl.get(key)
  if (!bucket || bucket.resetAt <= now) {
    ws.rl.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

const publicInfo = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  avatarUrl: user.avatarUrl ?? null,
})

const onlineMutualsOf = (userId, mutuals) => {
  const list = []
  for (const id of mutuals) {
    const entry = online.get(id)
    if (entry) list.push(entry.info)
  }
  return list
}

const broadcastPresenceJoin = (user) => {
  const entry = online.get(user.id)
  if (!entry) return
  for (const mutualId of entry.mutuals) {
    if (mutualId !== user.id) sendToUser(mutualId, { type: 'presence:join', user: entry.info })
  }
}

const broadcastPresenceLeave = (userId) => {
  for (const entry of online.values()) {
    if (entry.mutuals.has(userId)) {
      for (const ws of entry.sockets) send(ws, { type: 'presence:leave', userId })
    }
  }
}

const broadcastToRoom = (room, msg) => {
  for (const set of room.sockets.values()) {
    for (const ws of set) send(ws, msg)
  }
}

const userHasSocketInRoom = (room, userId) => (room.sockets.get(userId)?.size ?? 0) > 0

const addSocketToRoom = (room, ws) => {
  const set = room.sockets.get(ws.user.id) ?? new Set()
  set.add(ws)
  room.sockets.set(ws.user.id, set)
  room.left.delete(ws.user.id)
  ws.rooms.add(room.key)
  if (room.purgeTimer) {
    clearTimeout(room.purgeTimer)
    room.purgeTimer = null
  }
}

const schedulePurge = (room) => {
  if (room.purgeTimer) return
  room.purgeTimer = setTimeout(() => {
    broadcastToRoom(room, { type: 'room:ended', room: room.key })
    rooms.delete(room.key)
  }, PURGE_GRACE_MS)
}

const maybePurgeRoom = (room) => {
  // Explicitly left by everyone — gone immediately.
  if (room.left.size >= room.members.size) {
    if (room.purgeTimer) clearTimeout(room.purgeTimer)
    rooms.delete(room.key)
    return
  }
  // No live sockets — hold the buffer briefly for reconnects, then drop it.
  let anySockets = false
  for (const set of room.sockets.values()) {
    if (set.size > 0) {
      anySockets = true
      break
    }
  }
  if (!anySockets) schedulePurge(room)
}

const detachFromRooms = (ws) => {
  const userId = ws.user?.id
  for (const key of ws.rooms) {
    const room = rooms.get(key)
    if (!room) continue
    room.sockets.get(userId)?.delete(ws)
    if (userId != null && !userHasSocketInRoom(room, userId)) {
      broadcastToRoom(room, { type: 'peer:left', room: key, userId })
    }
    maybePurgeRoom(room)
  }
  ws.rooms.clear()
}

const expirePendingFor = (userId) => {
  // Invites are meaningless once either side is fully offline.
  for (const [key, invite] of pending) {
    if (invite.from !== userId && invite.to !== userId) continue
    clearTimeout(invite.timer)
    pending.delete(key)
    const other = invite.from === userId ? invite.to : invite.from
    sendToUser(other, { type: 'invite:cancelled', room: key })
  }
}

const activateRoom = (key, memberIds) => {
  let room = rooms.get(key)
  if (!room) {
    room = {
      key,
      members: new Set(memberIds),
      sockets: new Map(),
      left: new Set(),
      buffer: [],
      seq: 0,
      purgeTimer: null,
    }
    rooms.set(key, room)
  }
  return room
}

const handleAuth = async (ws, ticket) => {
  if (ws.user || typeof ticket !== 'string' || !SECRET) return
  try {
    const { payload } = await jwtVerify(ticket, SECRET_BYTES, { algorithms: ['HS256'] })
    const id = Number(payload.uid)
    if (!Number.isInteger(id) || id <= 0) throw new Error('bad uid')

    const mutuals = Array.isArray(payload.mutuals)
      ? payload.mutuals.filter((m) => Number.isInteger(m)).slice(0, MUTUALS_MAX)
      : []

    ws.user = {
      id,
      name: String(payload.name ?? 'User').slice(0, 120),
      username: String(payload.username ?? '').slice(0, 60),
      avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl.slice(0, 500) : null,
    }
    ws.mutuals = new Set(mutuals)
    clearTimeout(ws.authTimer)

    let entry = online.get(id)
    const firstSocket = !entry
    if (!entry) {
      entry = { info: publicInfo(ws.user), mutuals: ws.mutuals, sockets: new Set() }
      online.set(id, entry)
    }
    entry.sockets.add(ws)

    send(ws, {
      type: 'auth:ok',
      self: entry.info,
      online: onlineMutualsOf(id, ws.mutuals),
    })
    if (firstSocket) broadcastPresenceJoin(ws.user)

    // Seamless reconnect: rejoin rooms this user is still a member of and
    // replay their buffers (inside the grace window).
    for (const room of rooms.values()) {
      // Rooms the user explicitly left don't auto-rejoin on reconnect.
      if (!room.members.has(id) || room.left.has(id)) continue
      addSocketToRoom(room, ws)
      const peerId = [...room.members].find((m) => m !== id)
      const peer = peerId != null ? (online.get(peerId)?.info ?? { id: peerId }) : null
      send(ws, { type: 'joined', room: room.key, peer, history: room.buffer })
      broadcastToRoom(room, { type: 'peer:joined', room: room.key, userId: id })
    }
  } catch {
    send(ws, { type: 'error', code: 'auth', message: 'Invalid or expired chat ticket.' })
    ws.close(4003, 'auth failed')
  }
}

const handleInvite = (ws, to) => {
  const from = ws.user.id
  const target = Number(to)
  if (!Number.isInteger(target) || target === from) return
  if (!allow(ws, 'invite', 10, 60_000)) {
    return send(ws, { type: 'error', code: 'rate', message: 'Too many invites — slow down.' })
  }
  if (!ws.mutuals.has(target)) {
    return send(ws, {
      type: 'error',
      code: 'forbidden',
      message: 'You can only chat mutual follows.',
    })
  }
  const targetEntry = online.get(target)
  if (!targetEntry || !targetEntry.mutuals.has(from)) {
    return send(ws, { type: 'error', code: 'offline', message: 'They are not online right now.' })
  }

  const key = pairKey(from, target)

  // Existing room — invite doubles as a rejoin for the sender.
  const room = rooms.get(key)
  if (room?.members.has(from)) {
    addSocketToRoom(room, ws)
    room.left.delete(from)
    send(ws, { type: 'joined', room: key, peer: targetEntry.info, history: room.buffer })
    return
  }

  // Mutual invites collapse: an invite back auto-accepts the pending one.
  const existing = pending.get(key)
  if (existing && existing.from === target && existing.to === from) {
    clearTimeout(existing.timer)
    pending.delete(key)
    return activateForPair(key, target, from)
  }
  if (existing) {
    return send(ws, { type: 'invite:sent', room: key, to: targetEntry.info })
  }

  const timer = setTimeout(() => {
    pending.delete(key)
    sendToUser(from, { type: 'invite:expired', room: key })
    sendToUser(target, { type: 'invite:expired', room: key })
  }, INVITE_TTL_MS)

  pending.set(key, { from, to: target, timer })
  for (const socket of targetEntry.sockets) {
    send(socket, { type: 'invite', room: key, from: publicInfo(ws.user) })
  }
  send(ws, { type: 'invite:sent', room: key, to: targetEntry.info })
}

const activateForPair = (key, a, b) => {
  const room = activateRoom(key, [a, b])
  for (const uid of [a, b]) {
    const entry = online.get(uid)
    if (!entry) continue
    const peerId = uid === a ? b : a
    const peer = online.get(peerId)?.info ?? { id: peerId }
    for (const socket of entry.sockets) {
      addSocketToRoom(room, socket)
      send(socket, { type: 'joined', room: key, peer, history: room.buffer })
    }
  }
}

const handleAccept = (ws, key) => {
  const invite = pending.get(key)
  if (!invite || invite.to !== ws.user.id) return
  clearTimeout(invite.timer)
  pending.delete(key)
  activateForPair(key, invite.from, invite.to)
}

const handleDecline = (ws, key) => {
  const invite = pending.get(key)
  if (!invite || invite.to !== ws.user.id) return
  clearTimeout(invite.timer)
  pending.delete(key)
  sendToUser(invite.from, { type: 'invite:declined', room: key, by: publicInfo(ws.user) })
}

const handleJoin = (ws, key) => {
  const room = rooms.get(key)
  if (!room || !room.members.has(ws.user.id)) return
  addSocketToRoom(room, ws)
  const peerId = [...room.members].find((m) => m !== ws.user.id)
  const peer = peerId != null ? (online.get(peerId)?.info ?? { id: peerId }) : null
  send(ws, { type: 'joined', room: key, peer, history: room.buffer })
  broadcastToRoom(room, { type: 'peer:joined', room: key, userId: ws.user.id })
}

const handleMessage = (ws, key, body) => {
  const room = rooms.get(key)
  if (!room || !userHasSocketInRoom(room, ws.user.id)) {
    return send(ws, { type: 'error', code: 'forbidden', message: 'You are not in this room.' })
  }
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text || text.length > BODY_MAX) return
  if (!allow(ws, 'msg', 12, 5_000)) {
    return send(ws, { type: 'error', code: 'rate', message: 'Sending too fast.' })
  }

  const entry = { id: ++room.seq, from: ws.user.id, body: text, ts: Date.now() }
  room.buffer.push(entry)
  if (room.buffer.length > BUFFER_MAX) room.buffer.shift()
  broadcastToRoom(room, { type: 'msg', room: key, ...entry })
}

const handleTyping = (ws, key) => {
  // Pure relay — no state kept server-side; receivers time it out after ~3s
  // and a real message clears it anyway. Throttled so a chatty client can't
  // amplify keystrokes into broadcast spam.
  const room = rooms.get(key)
  if (!room || !userHasSocketInRoom(room, ws.user.id)) return
  if (!allow(ws, 'typing', 6, 3_000)) return
  for (const [memberId, set] of room.sockets) {
    if (memberId === ws.user.id) continue
    for (const socket of set) send(socket, { type: 'typing', room: key, userId: ws.user.id })
  }
}

const handleLeave = (ws, key) => {
  const room = rooms.get(key)
  if (!room || !room.members.has(ws.user.id)) return
  const userId = ws.user.id
  room.left.add(userId)
  for (const socket of room.sockets.get(userId) ?? []) {
    socket.rooms.delete(key)
  }
  room.sockets.delete(userId)
  broadcastToRoom(room, { type: 'peer:left', room: key, userId })
  ws.rooms.delete(key)
  maybePurgeRoom(room)
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin ?? ''
  if (ORIGINS.length > 0 && !ORIGINS.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

wss.on('connection', (ws) => {
  ws.isAlive = true
  ws.rooms = new Set()
  ws.user = null
  ws.mutuals = new Set()
  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.authTimer = setTimeout(() => {
    if (!ws.user) ws.close(4001, 'auth timeout')
  }, AUTH_TIMEOUT_MS)

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (typeof msg?.type !== 'string') return

    if (msg.type === 'auth') return void handleAuth(ws, msg.ticket)
    if (!ws.user) return

    switch (msg.type) {
      case 'invite':
        return handleInvite(ws, msg.to)
      case 'accept':
        return handleAccept(ws, String(msg.room ?? ''))
      case 'decline':
        return handleDecline(ws, String(msg.room ?? ''))
      case 'join':
        return handleJoin(ws, String(msg.room ?? ''))
      case 'msg':
        return handleMessage(ws, String(msg.room ?? ''), msg.body)
      case 'typing':
        return handleTyping(ws, String(msg.room ?? ''))
      case 'leave':
        return handleLeave(ws, String(msg.room ?? ''))
    }
  })

  ws.on('close', () => {
    clearTimeout(ws.authTimer)
    const user = ws.user
    if (!user) return

    const entry = online.get(user.id)
    entry?.sockets.delete(ws)
    const fullyOffline = !entry || entry.sockets.size === 0
    if (fullyOffline) {
      online.delete(user.id)
      broadcastPresenceLeave(user.id)
      expirePendingFor(user.id)
    }
    detachFromRooms(ws)
  })
})

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, KEEPALIVE_MS).unref()

server.listen(PORT, () => {
  console.log(`[chat] ws listening on :${PORT}`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const ws of wss.clients) ws.close(1001, 'server shutting down')
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2_000).unref()
  })
}

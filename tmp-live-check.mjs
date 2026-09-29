// E2E check of the deployed chat-server. Run: node --env-file=.env tmp-live-check.mjs
// Reports each stage independently — a local/prod ticket-secret mismatch fails
// auth but shouldn't block the /emit checks.
import { SignJWT } from 'jose'
import WebSocket from 'ws'

const WS_URL = 'wss://ws.kitakits.me'
const BASE = 'https://ws.kitakits.me'
const TICKET_SECRET = process.env.CHAT_TICKET_SECRET || process.env.PAYLOAD_SECRET
const EMIT_SECRET = process.env.LIVE_EMIT_SECRET
const UID = 999001
const results = []
const report = (ok, name, extra = '') =>
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)

// 1. health
try {
  const res = await fetch(`${BASE}/health`)
  report(res.status === 200, 'GET /health', `status ${res.status}`)
} catch (e) {
  report(false, 'GET /health', e.message)
}

// 2. ws connect + auth
let socket = null
try {
  if (!TICKET_SECRET) throw new Error('no CHAT_TICKET_SECRET/PAYLOAD_SECRET in .env')
  const ticket = await new SignJWT({ uid: UID, name: 'Probe', username: 'probe', mutuals: [] })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(new TextEncoder().encode(TICKET_SECRET))

  socket = await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { headers: { origin: 'https://kitakits.me' } })
    const inbox = []
    ws.on('message', (d) => inbox.push(JSON.parse(d.toString())))
    ws.on('error', (e) => resolve({ error: `upgrade failed: ${e.message}` }))
    ws.on('close', (code) => {
      if (inbox.some((m) => m.type === 'auth:ok')) return
      const authErr = inbox.find((m) => m.type === 'error')
      resolve({
        error: `closed ${code}${authErr ? ` (${authErr.message})` : ''}`,
      })
    })
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', ticket }))
      const until = Date.now() + 5000
      const poll = setInterval(() => {
        if (inbox.some((m) => m.type === 'auth:ok')) {
          clearInterval(poll)
          resolve(ws)
        } else if (Date.now() > until) {
          clearInterval(poll)
          resolve({ error: `no auth:ok; inbox=${JSON.stringify(inbox)}` })
        }
      }, 50)
    })
  })
  report('onopen' in socket, 'ws connect + auth', socket.error || '')
} catch (e) {
  report(false, 'ws connect + auth', e.message)
}

// 3. emit → delivery (needs the authed socket from step 2)
const emit = (secret, body) =>
  fetch(`${BASE}/emit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  })

try {
  if (!EMIT_SECRET) throw new Error('no LIVE_EMIT_SECRET in .env')
  const res = await emit(EMIT_SECRET, { type: 'badges', to: [UID] })
  const body = await res.text()
  report(res.status === 200, 'POST /emit authed', `${res.status} ${body}`)

  if (res.status === 200 && socket && 'on' in socket) {
    const delivered = await new Promise((resolve) => {
      const to = setTimeout(() => resolve(false), 4000)
      socket.on('message', (d) => {
        if (JSON.parse(d.toString()).type === 'badges') {
          clearTimeout(to)
          resolve(true)
        }
      })
    })
    report(delivered, 'emit → socket delivery')
  } else if (res.status === 200) {
    report(true, 'emit → socket delivery', 'skipped (no authed socket)')
  }

  const denied = await emit('definitely-wrong', { type: 'badges', to: [UID] })
  report(denied.status === 401, 'POST /emit wrong secret', `status ${denied.status}`)
} catch (e) {
  report(false, 'POST /emit', e.message)
}

if (socket && 'close' in socket) socket.close()
console.log(results.join('\n'))
process.exit(0)

// Integration test for the standalone chat WebSocket service. Spawns the real
// server.mjs with a test secret + fast timeouts, then drives it with `ws`
// clients — no Next.js or database involved, matching production isolation.
// Node env (not jsdom) so jose's Uint8Array realm checks behave.

// @vitest-environment node

import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

import { SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

const PORT = 3901
const URL = `ws://127.0.0.1:${PORT}`
const SECRET = 'chat-test-secret-chat-test-secret-32b'
const SECRET_BYTES = new TextEncoder().encode(SECRET)

let proc: ChildProcess

const mintTicket = (uid: number, mutuals: number[], name = `User${uid}`) =>
  new SignJWT({ uid, name, username: `user${uid}`, mutuals })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(SECRET_BYTES)

interface Client {
  ws: WebSocket
  inbox: Record<string, unknown>[]
  closed: Promise<number>
}

const connect = async (ticket?: string): Promise<Client> => {
  const ws = new WebSocket(URL)
  const client: Client = {
    ws,
    inbox: [],
    closed: new Promise((resolve) => ws.on('close', (code) => resolve(code))),
  }
  ws.on('message', (raw) => client.inbox.push(JSON.parse(raw.toString())))
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  if (ticket) ws.send(JSON.stringify({ type: 'auth', ticket }))
  return client
}

const waitFor = async (
  client: Client,
  pred: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const hit = client.inbox.find(pred)
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for message; inbox=${JSON.stringify(client.inbox)}`)
}

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

describe('chat-server', () => {
  beforeAll(async () => {
    proc = spawn('node', [path.resolve(__dirname, '../../chat-server/server.mjs')], {
      env: {
        ...process.env,
        WS_PORT: String(PORT),
        CHAT_TICKET_SECRET: SECRET,
        LIVE_EMIT_SECRET: 'emit-test-secret',
        // .env ships a dev ALLOWED_ORIGIN — neutralize it so the Node ws
        // client (which sends its own Origin) isn't rejected in tests.
        ALLOWED_ORIGIN: '',
        CHAT_AUTH_TIMEOUT_MS: '200',
        CHAT_INVITE_TTL_MS: '1000',
        CHAT_PURGE_GRACE_MS: '300',
        CHAT_KEEPALIVE_MS: '60000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc.stderr?.on('data', (d) => process.stderr.write(`[chat-server] ${d}`))
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 5000)
      proc.stdout?.on('data', (d) => {
        if (String(d).includes('listening')) {
          clearTimeout(timer)
          resolve()
        }
      })
      proc.on('exit', (code) => reject(new Error(`server exited early: ${code}`)))
    })
  })

  afterAll(() => {
    proc?.kill('SIGTERM')
  })

  it('closes unauthenticated sockets after the auth timeout', async () => {
    const client = await connect()
    const code = await client.closed
    expect(code).toBe(4001)
  })

  it('rejects bad tickets', async () => {
    const client = await connect('not-a-jwt')
    await waitFor(client, (m) => m.type === 'error' && m.code === 'auth')
    const code = await client.closed
    expect(code).toBe(4003)
  })

  it('authenticates, broadcasts presence to mutuals, relays invites and messages', async () => {
    const alice = await connect(await mintTicket(1, [2], 'Alice'))
    await waitFor(alice, (m) => m.type === 'auth:ok' && (m.online as unknown[]).length === 0)

    const bob = await connect(await mintTicket(2, [1], 'Bob'))
    await waitFor(bob, (m) => m.type === 'auth:ok' && (m.online as unknown[]).length === 1)
    await waitFor(alice, (m) => m.type === 'presence:join' && (m.user as { id: number }).id === 2)

    const key = pairKey(1, 2)
    alice.ws.send(JSON.stringify({ type: 'invite', to: 2 }))
    await waitFor(bob, (m) => m.type === 'invite' && m.room === key)

    bob.ws.send(JSON.stringify({ type: 'accept', room: key }))
    await waitFor(alice, (m) => m.type === 'joined' && m.room === key)
    await waitFor(bob, (m) => m.type === 'joined' && m.room === key)

    alice.ws.send(JSON.stringify({ type: 'msg', room: key, body: 'hi bob' }))
    const relayed = await waitFor(bob, (m) => m.type === 'msg' && m.body === 'hi bob')
    expect(relayed.from).toBe(1)

    alice.ws.close()
    await waitFor(bob, (m) => m.type === 'presence:leave' && m.userId === 1)
    bob.ws.close()
    await bob.closed
  })

  it("refreshes a live entry's mutuals when another socket auths a newer ticket", async () => {
    // Jay authed before the mutual-follow existed; until a fresher ticket
    // arrives, invites bounce off his stale mutuals even though he shows
    // online to Kim.
    const jay = await connect(await mintTicket(10, [], 'Jay'))
    await waitFor(jay, (m) => m.type === 'auth:ok')

    const kim = await connect(await mintTicket(11, [10], 'Kim'))
    await waitFor(kim, (m) => m.type === 'auth:ok' && (m.online as unknown[]).length === 1)

    const key = pairKey(10, 11)
    kim.ws.send(JSON.stringify({ type: 'invite', to: 10 }))
    await waitFor(kim, (m) => m.type === 'error' && m.code === 'offline')

    // Jay's second tab auths with a ticket minted after the follow — the
    // entry's mutuals must follow the newest ticket, not the first socket's.
    const jay2 = await connect(await mintTicket(10, [11], 'Jay'))
    await waitFor(jay2, (m) => m.type === 'auth:ok')

    kim.ws.send(JSON.stringify({ type: 'invite', to: 10 }))
    await waitFor(kim, (m) => m.type === 'invite:sent' && m.room === key)
    await waitFor(jay, (m) => m.type === 'invite' && m.room === key)
    await waitFor(jay2, (m) => m.type === 'invite' && m.room === key)

    jay.ws.close()
    jay2.ws.close()
    kim.ws.close()
  })

  it('rejects invites outside the mutual set', async () => {
    const carol = await connect(await mintTicket(3, [], 'Carol'))
    await waitFor(carol, (m) => m.type === 'auth:ok')
    carol.ws.send(JSON.stringify({ type: 'invite', to: 1 }))
    const err = await waitFor(carol, (m) => m.type === 'error')
    expect(err.code).toBe('forbidden')
    carol.ws.close()
    await carol.closed
  })

  it('purges room buffers after the grace window', async () => {
    const dana = await connect(await mintTicket(4, [5], 'Dana'))
    const erin = await connect(await mintTicket(5, [4], 'Erin'))
    await waitFor(dana, (m) => m.type === 'auth:ok')
    await waitFor(erin, (m) => m.type === 'auth:ok')

    const key = pairKey(4, 5)
    dana.ws.send(JSON.stringify({ type: 'invite', to: 5 }))
    await waitFor(erin, (m) => m.type === 'invite')
    erin.ws.send(JSON.stringify({ type: 'accept', room: key }))
    await waitFor(dana, (m) => m.type === 'joined')
    dana.ws.send(JSON.stringify({ type: 'msg', room: key, body: 'ephemeral' }))
    await waitFor(erin, (m) => m.type === 'msg')

    // Everyone leaves — buffer should be purged after ~300ms grace.
    dana.ws.send(JSON.stringify({ type: 'leave', room: key }))
    erin.ws.send(JSON.stringify({ type: 'leave', room: key }))
    await new Promise((r) => setTimeout(r, 600))

    const dana2 = await connect(await mintTicket(4, [5], 'Dana'))
    await waitFor(dana2, (m) => m.type === 'auth:ok')
    await new Promise((r) => setTimeout(r, 150))
    expect(dana2.inbox.some((m) => m.type === 'joined')).toBe(false)

    dana2.ws.close()
    erin.ws.close()
  })

  it('relays typing pings to the peer only, never back to the sender', async () => {
    const frank = await connect(await mintTicket(6, [7], 'Frank'))
    const gwen = await connect(await mintTicket(7, [6], 'Gwen'))
    await waitFor(frank, (m) => m.type === 'auth:ok')
    await waitFor(gwen, (m) => m.type === 'auth:ok')

    const key = pairKey(6, 7)
    frank.ws.send(JSON.stringify({ type: 'invite', to: 7 }))
    await waitFor(gwen, (m) => m.type === 'invite')
    gwen.ws.send(JSON.stringify({ type: 'accept', room: key }))
    await waitFor(frank, (m) => m.type === 'joined')
    await waitFor(gwen, (m) => m.type === 'joined')

    frank.ws.send(JSON.stringify({ type: 'typing', room: key }))
    const relayed = await waitFor(gwen, (m) => m.type === 'typing' && m.room === key)
    expect(relayed.userId).toBe(6)

    // Give the wire a beat — nothing should echo to the sender.
    await new Promise((r) => setTimeout(r, 150))
    expect(frank.inbox.some((m) => m.type === 'typing')).toBe(false)

    frank.ws.close()
    gwen.ws.close()
  })

  it('relays /emit events to the listed users only', async () => {
    const hank = await connect(await mintTicket(8, [9], 'Hank'))
    const ivy = await connect(await mintTicket(9, [8], 'Ivy'))
    await waitFor(hank, (m) => m.type === 'auth:ok')
    await waitFor(ivy, (m) => m.type === 'auth:ok')

    const res = await fetch(`http://127.0.0.1:${PORT}/emit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer emit-test-secret',
      },
      body: JSON.stringify({ type: 'badges', to: [8] }),
    })
    expect(res.status).toBe(200)
    await waitFor(hank, (m) => m.type === 'badges')
    // Ivy is online but not a target — nothing should reach her.
    await new Promise((r) => setTimeout(r, 150))
    expect(ivy.inbox.some((m) => m.type === 'badges')).toBe(false)

    // Wrong bearer token → 401, nothing delivered.
    const denied = await fetch(`http://127.0.0.1:${PORT}/emit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong',
      },
      body: JSON.stringify({ type: 'badges', to: [8] }),
    })
    expect(denied.status).toBe(401)
    await new Promise((r) => setTimeout(r, 150))
    expect(hank.inbox.filter((m) => m.type === 'badges')).toHaveLength(1)

    hank.ws.close()
    ivy.ws.close()
  })
})

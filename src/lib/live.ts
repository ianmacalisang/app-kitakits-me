import { after } from 'next/server'
import type { Payload } from 'payload'

import { relId } from './serialize'

// Server → client live push. The standalone chat-server (chat-server/) holds
// every signed-in user's sockets; POSTing to its /emit endpoint fans an event
// out to each target user's tabs. ChatProvider re-dispatches them as window
// LIVE_EVENTs so badges, feeds, and video cards update instantly.
//
// Two constraints shape the API:
//   - The app runs on Vercel serverless — a floating fetch() can be frozen
//     mid-flight the moment the action responds, so all pushes are scheduled
//     via after(), which Vercel keeps the function alive for.
//   - Everything is best-effort: a down chat service or missed call must never
//     fail the mutation. Clients keep a slow polling fallback for that case.

const EMIT_URL = process.env.CHAT_EMIT_URL ?? 'http://localhost:3001/emit'
const EMIT_SECRET = process.env.LIVE_EMIT_SECRET ?? ''

export type LiveEvent =
  | { type: 'badges' }
  | { type: 'feed:new'; authorId: number }
  | { type: 'video:status'; videoId: number; status: 'ready' | 'failed' }

const emit = async (ids: number[], event: LiveEvent): Promise<void> => {
  if (ids.length === 0 || !EMIT_SECRET) return
  try {
    await fetch(EMIT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${EMIT_SECRET}`,
      },
      body: JSON.stringify({ ...event, to: ids }),
    })
  } catch {}
}

// `to` may be a promise so recipient lookups (followerIds) also defer until
// after the response — the mutation path stays fast.
export function pushLive(to: number | number[] | Promise<number[]>, event: LiveEvent): void {
  const send = async () => {
    const resolved = await to
    const ids = [...new Set(Array.isArray(resolved) ? resolved : [resolved])].filter(
      (id): id is number => Number.isInteger(id) && id > 0,
    )
    await emit(ids, event)
  }
  try {
    after(send)
  } catch {
    // No request context (tests, scripts, queued jobs) — best-effort push.
    void send()
  }
}

// Follower ids for fan-out — used when an author's action should ping everyone
// whose feed it affects. Never throws: a failed lookup just means the push is
// skipped and fallback polling picks it up.
export async function followerIds(payload: Payload, userId: number): Promise<number[]> {
  try {
    const follows = await payload.find({
      collection: 'follows',
      where: { following: { equals: userId } },
      select: { follower: true },
      depth: 0,
      limit: 10_000,
      overrideAccess: true,
    })
    return follows.docs.map((doc) => relId(doc.follower)).filter((id): id is number => id !== null)
  } catch {
    return []
  }
}

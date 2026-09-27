import { headers } from 'next/headers'

// Fixed-window rate limiter backed by an in-process Map. Per-instance — under
// multiple replicas each process enforces the limit independently, which is
// still effective as a baseline; swap `buckets` for Redis/Upstash for strict
// global limits.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
const SWEEP_MS = 60_000
let lastSweep = 0

// Returns true while under the limit; false once `limit` hits within the
// window. Expired buckets are swept lazily on access.
export function checkRate(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  if (now - lastSweep > SWEEP_MS) {
    lastSweep = now
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count++
  return bucket.count <= limit
}

// Per-IP variant for server actions — trusts x-forwarded-for (set by the
// proxy/CDN). A bare host falls back to 'unknown', which still rate-limits.
export async function rateLimitIP(
  prefix: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const store = await headers()
  const ip = store.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  return checkRate(`${prefix}:${ip}`, limit, windowMs)
}

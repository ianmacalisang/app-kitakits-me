import { sql } from '@payloadcms/db-postgres'

import { drizzleOf } from '@/lib/db'
import { getPayloadClient } from '@/lib/payload'

export const dynamic = 'force-dynamic'

// Load-balancer health probe — verifies the DB pool can serve a query rather
// than just that the process is up.
export async function GET() {
  try {
    const payload = await getPayloadClient()
    const db = drizzleOf(payload)
    if (!db) throw new Error('no drizzle handle')
    await db.execute(sql`SELECT 1`)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}

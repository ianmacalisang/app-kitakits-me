import type { Payload } from 'payload'

// Minimal shape of the Drizzle handle on the Postgres adapter — enough for
// raw SQL. `payload.db` is typed as the generic DatabaseAdapter, which hides
// the adapter-specific `drizzle` property.
export type DrizzleHandle = {
  execute: (query: unknown) => Promise<{ rows: unknown[] }>
}

export const drizzleOf = (payload: Payload): DrizzleHandle | null =>
  (payload.db as unknown as { drizzle?: DrizzleHandle }).drizzle ?? null

import { headers } from 'next/headers'
import { cache } from 'react'

import { getPayloadClient } from './payload'

// Deduplicated per request — every server component or layout that calls
// getCurrentUser() in the same render shares one DB round-trip.
export const getCurrentUser = cache(async () => {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  return user
})

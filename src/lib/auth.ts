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

// Public origin of the current request (scheme + host), for building absolute
// links — e.g. the password-reset URL embedded in forgot-password emails.
export const getRequestOrigin = async () => {
  const store = await headers()
  const host = store.get('x-forwarded-host')?.split(',')[0]?.trim() ?? store.get('host')
  if (!host) return ''
  const proto = store.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http'
  return `${proto}://${host}`
}

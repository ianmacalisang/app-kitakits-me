import type { MetadataRoute } from 'next'

import { getPayloadClient } from '@/lib/payload'

// Public sitemap — static marketing/auth routes plus every public profile
// (/@username), capped so the single-file sitemap stays small. Falls back to
// the static routes alone when the DB is unreachable (e.g. build-time
// prerendering without a database).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const routes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/discover`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/register`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/login`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  try {
    const payload = await getPayloadClient()
    const profiles = await payload.find({
      collection: 'users',
      where: { publicProfile: { equals: true } },
      select: { username: true, updatedAt: true },
      sort: '-updatedAt',
      limit: 5000,
      depth: 0,
    })
    for (const profile of profiles.docs) {
      routes.push({
        url: `${base}/@${profile.username}`,
        lastModified: profile.updatedAt ? new Date(profile.updatedAt) : undefined,
        changeFrequency: 'daily',
        priority: 0.6,
      })
    }
  } catch {
    // DB unavailable — ship the static routes only.
  }

  return routes
}

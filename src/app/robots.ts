import type { MetadataRoute } from 'next'

// Public surfaces (/, /discover, /@handle) stay crawlable; everything behind
// auth plus admin/API is disallowed so private content never gets indexed.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api/',
        '/home',
        '/explore',
        '/mailbox',
        '/settings',
        '/profile',
        '/hangouts',
        '/testimonials',
        '/invite',
        '/onboarding',
        '/connect',
        '/forgot-password',
        '/reset-password',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}

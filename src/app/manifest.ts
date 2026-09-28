import type { MetadataRoute } from 'next'

import { getSiteSettings } from '@/lib/settings'

// PWA manifest — name/description follow the admin-editable site settings.
// start_url is /home (not /): login redirects there, and the landing page
// doesn't bounce logged-in users, so it would land installed users on the
// marketing page every open.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettings()

  return {
    name: settings.appName,
    short_name: settings.appName,
    description: settings.metaDescription,
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#141414',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

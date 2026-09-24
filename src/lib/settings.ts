import { cache } from 'react'

import { DEFAULT_BRANDING, type SiteBranding } from './branding'
import { toCdnUrl } from './cdn'
import { getPayloadClient } from './payload'

const mediaUrl = (value: unknown): string | undefined => {
  if (typeof value === 'object' && value !== null) {
    return toCdnUrl((value as { url?: string | null }).url)
  }
  return undefined
}

// Server-only. Cached per request — every layout/page that needs branding
// shares one read.
export const getSiteSettings = cache(async (): Promise<SiteBranding> => {
  try {
    const payload = await getPayloadClient()
    const settings = await payload.findGlobal({ slug: 'site-settings', depth: 1 })

    const appName = settings.appName?.trim() || DEFAULT_BRANDING.appName
    return {
      appName,
      logoUrl: mediaUrl(settings.logo),
      metaTitle: settings.metaTitle?.trim() || appName,
      metaDescription: settings.metaDescription?.trim() || DEFAULT_BRANDING.metaDescription,
      ogImageUrl: mediaUrl(settings.ogImage),
      heroHeading: settings.heroHeading?.trim() || appName,
      heroTagline: settings.heroTagline?.trim() || DEFAULT_BRANDING.heroTagline,
      loginPrompt: settings.loginPrompt?.trim() || DEFAULT_BRANDING.loginPrompt,
      registerPrompt: settings.registerPrompt?.trim() || DEFAULT_BRANDING.registerPrompt,
    }
  } catch {
    return DEFAULT_BRANDING
  }
})

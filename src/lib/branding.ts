// Client-safe branding shape and defaults — no server-only imports allowed
// here (this module is bundled into client components).
export interface SiteBranding {
  appName: string
  logoUrl?: string
  metaTitle: string
  metaDescription: string
  ogImageUrl?: string
  heroHeading: string
  heroTagline: string
  loginPrompt: string
  registerPrompt: string
}

export const DEFAULT_BRANDING: SiteBranding = {
  appName: 'Kitakits',
  metaTitle: 'Kitakits',
  metaDescription: 'Kitakits — a minimal social network.',
  heroHeading: 'Kitakits',
  heroTagline: 'a minimal social network.',
  loginPrompt: 'Log in to your account',
  registerPrompt: 'Create your account',
}

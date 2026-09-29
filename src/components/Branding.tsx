'use client'

import { createContext, useContext } from 'react'

import { DEFAULT_BRANDING, type SiteBranding } from '@/lib/branding'

import { BlurImage } from './BlurImage'

const BrandingContext = createContext<SiteBranding>(DEFAULT_BRANDING)

export function BrandingProvider({
  branding,
  children,
}: {
  branding: SiteBranding
  children: React.ReactNode
}) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
}

export const useBranding = () => useContext(BrandingContext)

const markSizes = {
  sm: 'h-8 w-8 rounded-xl text-sm',
  md: 'h-12 w-12 rounded-2xl text-lg',
  lg: 'h-14 w-14 rounded-2xl text-xl',
  xl: 'h-20 w-20 rounded-3xl text-3xl',
}

// Brand mark — the uploaded logo when set, otherwise a gradient letter tile.
export function BrandMark({ size = 'sm' }: { size?: keyof typeof markSizes }) {
  const { appName, logoUrl } = useBranding()
  const classes = `${markSizes[size]} shrink-0`

  if (logoUrl) {
    return <BlurImage src={logoUrl} alt={appName} className={`${classes} object-contain`} />
  }

  return (
    <span
      className={`${classes} flex items-center justify-center bg-gradient-to-br from-accent-500 via-accent-600 to-accent-800 font-bold text-white shadow-md shadow-accent-900/30`}
      aria-hidden
    >
      {appName.charAt(0).toUpperCase()}
    </span>
  )
}

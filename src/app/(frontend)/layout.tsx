import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import React from 'react'

import { BrandingProvider } from '@/components/Branding'
import { getCurrentUser } from '@/lib/auth'
import { getSiteSettings } from '@/lib/settings'

import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

// Lock the viewport scale — app-like fixed layout, no pinch/double-tap zoom.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  return {
    title: {
      default: settings.metaTitle,
      template: `%s — ${settings.appName}`,
    },
    description: settings.metaDescription,
    openGraph: settings.ogImageUrl ? { images: [{ url: settings.ogImageUrl }] } : undefined,
  }
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const [settings, user] = await Promise.all([getSiteSettings(), getCurrentUser()])
  const theme = user?.theme ?? 'light'

  return (
    <html
      lang="en"
      className={`${poppins.variable}${theme === 'dark' ? ' dark' : ''}`}
      data-theme={theme}
      suppressHydrationWarning
    >
      <head>
        {theme === 'system' && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}",
            }}
          />
        )}
      </head>
      <body>
        <BrandingProvider branding={settings}>{children}</BrandingProvider>
      </body>
    </html>
  )
}

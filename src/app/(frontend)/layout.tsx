import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import React from 'react'

import { BrandingProvider } from '@/components/Branding'
import { getCurrentUser } from '@/lib/auth'
import { getSiteSettings } from '@/lib/settings'

import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
})

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
      className={`${plusJakartaSans.variable}${theme === 'dark' ? ' dark' : ''}`}
      data-theme={theme}
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

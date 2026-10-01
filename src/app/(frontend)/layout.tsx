import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import React from 'react'

import { BrandingProvider, BrandMark } from '@/components/Branding'
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  return {
    // Absolute base for canonical + OG URLs — matches payload.config.serverURL.
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
    title: {
      default: settings.metaTitle,
      template: `%s — ${settings.appName}`,
    },
    description: settings.metaDescription,
    openGraph: settings.ogImageUrl ? { images: [{ url: settings.ogImageUrl }] } : undefined,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: settings.appName,
    },
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
        {/* Flags installed-PWA launches before paint so the launch screen
            (hidden by default) can show. matchMedia covers Android/desktop;
            navigator.standalone covers iOS home-screen apps. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(window.matchMedia('(display-mode: standalone)').matches||window.matchMedia('(display-mode: fullscreen)').matches||window.navigator.standalone===true)document.documentElement.classList.add('is-pwa')}catch(e){}",
          }}
        />
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
        <BrandingProvider branding={settings}>
          {children}
          {/* Installed-PWA launch screen — shown only under `html.is-pwa`
              (set by the head script above); CSS fades and hides it. */}
          <div id="launch-screen" aria-hidden>
            <div className="flex flex-col items-center gap-4">
              <BrandMark size="xl" />
              <span className="text-lg font-semibold tracking-tight">{settings.appName}</span>
            </div>
          </div>
        </BrandingProvider>
      </body>
    </html>
  )
}

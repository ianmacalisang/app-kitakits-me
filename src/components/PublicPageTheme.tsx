'use client'

import { useEffect } from 'react'

// Standalone public surfaces (/@username, /, /discover) render in a fixed
// theme, not the visitor's account theme. The root layout stamps the
// visitor's theme on <html> before the page mounts, so this flips the
// `dark` class for the visit and restores the visitor's resolved theme on
// the way out.
export function PublicPageTheme({
  theme,
  visitorTheme,
}: {
  theme: 'light' | 'dark'
  visitorTheme: 'light' | 'dark' | 'system'
}) {
  useEffect(() => {
    const el = document.documentElement
    el.classList.toggle('dark', theme === 'dark')
    return () => {
      const dark =
        visitorTheme === 'dark' ||
        (visitorTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      el.classList.toggle('dark', dark)
    }
  }, [theme, visitorTheme])

  return null
}

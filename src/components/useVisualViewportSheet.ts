'use client'

import { useEffect, type RefObject } from 'react'

// Keep a viewport-fixed overlay (bottom sheet / dialog) inside the visual
// viewport on mobile. The software keyboard only shrinks the visual
// viewport — the layout viewport (and dvh) stay put — so without this the
// browser pans the page to reveal a focused input and buries the sheet's
// header (or its bottom-pinned composer) off screen. Extracted from
// CreatePost; only applies below sm, where sheets are full-bleed.
export function useVisualViewportSheet(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    const overlay = ref.current
    if (!vv || !overlay) return
    const mobile = window.matchMedia('(max-width: 639px)')
    const sync = () => {
      if (!mobile.matches) {
        overlay.style.top = ''
        overlay.style.height = ''
        return
      }
      overlay.style.top = `${vv.offsetTop}px`
      overlay.style.height = `${vv.height}px`
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    mobile.addEventListener('change', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      mobile.removeEventListener('change', sync)
      overlay.style.top = ''
      overlay.style.height = ''
    }
  }, [ref, active])
}

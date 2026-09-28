'use client'

import { useRef, type TouchEvent } from 'react'

// Drag-down-to-dismiss for bottom sheets. Spread the returned props onto the
// sheet root. A drag engages when it starts on a [data-sheet-handle] element,
// or inside the [data-sheet-scroll] region (the sheet itself when unmarked)
// once that region is scrolled to the top. Past the dismiss threshold the
// sheet hands off to the caller's animated close() — sheet-down keyframes
// start from the current computed transform, so the slide-out continues
// seamlessly from the finger. Backdrop opacity tracks the drag distance.
export function useSheetDragClose(close: () => void) {
  const drag = useRef({
    startY: 0,
    dy: 0,
    active: false,
    onHandle: false,
    dragging: false,
    scrollEl: null as HTMLElement | null,
  })

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const sheet = e.currentTarget
    const onHandle = !!(e.target as HTMLElement).closest('[data-sheet-handle]')
    const scrollEl = sheet.querySelector<HTMLElement>('[data-sheet-scroll]') ?? sheet
    drag.current = {
      startY: e.touches[0].clientY,
      dy: 0,
      active: onHandle || scrollEl.scrollTop <= 4,
      onHandle,
      dragging: false,
      scrollEl,
    }
  }

  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    const sheet = e.currentTarget
    // Content scrolled away from the top before the drag threshold — let the
    // browser handle this as a normal scroll instead of dismissing.
    if (!d.dragging && !d.onHandle && d.scrollEl && d.scrollEl.scrollTop > 4) {
      d.active = false
      return
    }
    const dy = e.touches[0].clientY - d.startY
    if (!d.dragging) {
      // Small dead zone so taps and vertical scrolls don't jitter the sheet.
      if (dy <= 8) return
      d.dragging = true
      sheet.style.transition = 'none'
      sheet.style.willChange = 'transform'
    }
    d.dy = Math.max(0, dy)
    sheet.style.transform = `translateY(${d.dy}px)`
    const backdrop = sheet.previousElementSibling as HTMLElement | null
    if (backdrop) backdrop.style.opacity = String(Math.max(0.2, 1 - d.dy / sheet.offsetHeight))
  }

  const finish = (e: TouchEvent<HTMLDivElement>) => {
    const d = drag.current
    const sheet = e.currentTarget
    d.active = false
    if (!d.dragging) return
    d.dragging = false
    const backdrop = sheet.previousElementSibling as HTMLElement | null
    if (d.dy > Math.min(180, sheet.offsetHeight * 0.25)) {
      // Dismiss — close() plays sheet-down, which starts from the dragged
      // transform. Leave the inline transform in place; the unmount clears it.
      close()
      sheet.style.willChange = ''
    } else {
      // Snap back into place.
      sheet.style.transition = 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)'
      sheet.style.transform = ''
      if (backdrop) {
        backdrop.style.transition = 'opacity 0.28s ease'
        backdrop.style.opacity = ''
      }
      window.setTimeout(() => {
        sheet.style.transition = ''
        sheet.style.willChange = ''
        if (backdrop) backdrop.style.transition = ''
      }, 300)
    }
    d.dy = 0
  }

  return { onTouchStart, onTouchMove, onTouchEnd: finish, onTouchCancel: finish }
}

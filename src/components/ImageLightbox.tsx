'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { toCdnUrl } from '@/lib/cdn'

import { BlurImage } from './BlurImage'
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, XIcon } from './icons'

const CLOSE_MS = 220
const SWIPE_PX = 60
const TAP_MS = 300
const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5

interface Zoom {
  s: number
  x: number
  y: number
}

const IDLE_ZOOM: Zoom = { s: 1, x: 0, y: 0 }

// Full-screen image viewer with prev/next navigation and download.
// The parent owns `index`; the viewer manages its own close animation.
// Touch: horizontal swipe navigates (at 1x), pinch/double-tap zooms,
// single-finger pans while zoomed — the app's global viewport zoom lock
// doesn't apply to element transforms, so this works everywhere.
export const ImageLightbox = memo(function ImageLightbox({
  urls,
  index,
  onNavigateAction,
  onCloseAction,
}: {
  urls: string[]
  index: number | null
  onNavigateAction: (index: number) => void
  onCloseAction: () => void
}) {
  const [closing, setClosing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [zoom, setZoom] = useState<Zoom>(IDLE_ZOOM)
  // True while fingers are down — disables the snap-back transition so the
  // transform tracks the touch 1:1.
  const [gesturing, setGesturing] = useState(false)
  const open = index !== null

  const stageRef = useRef<HTMLDivElement>(null)
  const gesture = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    mode: 'idle' as 'idle' | 'swipe' | 'pan' | 'pinch',
    // Gesture start snapshot — swipe anchor / pan&pinch baseline.
    start: { x: 0, y: 0 },
    base: IDLE_ZOOM,
    pinchDist: 0,
    // Double-tap bookkeeping + "this release ended a real drag" flag so the
    // backdrop click that follows a swipe doesn't also close the viewer.
    lastTap: { t: 0, x: 0, y: 0 },
    suppressClick: false,
  })

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onCloseAction()
    }, CLOSE_MS)
  }, [closing, onCloseAction])

  // Keyboard navigation + scroll lock while the lightbox is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') onNavigateAction((index + 1) % urls.length)
      if (e.key === 'ArrowLeft') onNavigateAction((index - 1 + urls.length) % urls.length)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close, index, onNavigateAction, urls.length])

  // Fresh photo — drop any zoom/drag state from the previous one.
  useEffect(() => {
    setZoom(IDLE_ZOOM)
    gesture.current.pointers.clear()
    gesture.current.mode = 'idle'
  }, [index])

  const download = async () => {
    if (index === null || downloading) return
    setDownloading(true)
    const src = toCdnUrl(urls[index]) ?? urls[index]
    try {
      const blob = await (await fetch(src)).blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = src.split('/').pop()?.split('?')[0] || 'image'
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(src, '_blank', 'noopener')
    } finally {
      setDownloading(false)
    }
  }

  // Keep the image at least edge-adjacent while panning/zooming — the bounds
  // grow with scale so a 4x photo can be inspected corner to corner.
  const clampPan = useCallback((s: number, x: number, y: number) => {
    const box = stageRef.current
    if (!box) return { x, y }
    const rect = box.getBoundingClientRect()
    const mx = (rect.width * (s - 1)) / 2
    const my = (rect.height * (s - 1)) / 2
    return {
      x: Math.min(mx, Math.max(-mx, x)),
      y: Math.min(my, Math.max(-my, y)),
    }
  }, [])

  const stageCenter = () => {
    const rect = stageRef.current?.getBoundingClientRect()
    return rect ? { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 } : null
  }

  // Zoom to `next` scale anchored at client point (px,py) — the tapped /
  // pinched content point stays under the fingers.
  const zoomAt = useCallback(
    (next: number, px: number, py: number) => {
      const c = stageCenter()
      if (!c) return
      setZoom((z) => {
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
        if (s === 1) return IDLE_ZOOM
        const rx = px - c.cx
        const ry = py - c.cy
        const x = rx - ((rx - z.x) * s) / z.s
        const y = ry - ((ry - z.y) * s) / z.s
        return { s, ...clampPan(s, x, y) }
      })
    },
    [clampPan],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (index === null) return
    // Taps on the control buttons aren't gesture starts.
    if ((e.target as HTMLElement).closest('button')) return
    const g = gesture.current
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
    setGesturing(true)
    if (g.pointers.size === 2) {
      // Second finger down — promote whatever was happening to a pinch.
      // Snapshot the live transform (mid-swipe drags included) as the base.
      const [a, b] = [...g.pointers.values()]
      g.mode = 'pinch'
      g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      setZoom((z) => {
        g.base = z
        return z
      })
    } else if (g.pointers.size === 1) {
      g.start = { x: e.clientX, y: e.clientY }
      g.base = zoom
      g.mode = zoom.s > 1 ? 'pan' : 'swipe'
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g.pointers.has(e.pointerId)) return
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (g.mode === 'pinch' && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (dist < 10 || g.pinchDist < 10) return
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (g.base.s * dist) / g.pinchDist))
      // Anchor on the moving midpoint so the pinch feels pinned to the photo.
      const c = stageCenter()
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (c) {
        const rx = mid.x - c.cx
        const ry = mid.y - c.cy
        const x = rx - ((rx - g.base.x) * s) / g.base.s
        const y = ry - ((ry - g.base.y) * s) / g.base.s
        setZoom(s === 1 ? IDLE_ZOOM : { s, ...clampPan(s, x, y) })
      }
      g.suppressClick = true
      return
    }

    const p = g.pointers.get(e.pointerId)
    if (!p || g.pointers.size !== 1) return
    const dx = e.clientX - g.start.x
    const dy = e.clientY - g.start.y

    if (g.mode === 'pan' && g.base.s > 1) {
      const t = clampPan(g.base.s, g.base.x + dx, g.base.y + dy)
      setZoom({ s: g.base.s, ...t })
      if (Math.hypot(dx, dy) > 6) g.suppressClick = true
      return
    }

    if (g.mode === 'swipe') {
      // Mostly-horizontal drag — track the photo with the finger.
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        g.suppressClick = true
        setZoom({ s: 1, x: dx, y: 0 })
      }
    }
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    const had = g.pointers.delete(e.pointerId)
    if (!had) return
    if (g.pointers.size === 0) setGesturing(false)

    if (g.mode === 'pinch') {
      if (g.pointers.size === 1) {
        // Lifted one finger — the remaining finger pans from the settled zoom.
        const [p] = [...g.pointers.values()]
        g.start = { x: p.x, y: p.y }
        setZoom((z) => {
          g.base = z
          g.mode = z.s > 1 ? 'pan' : 'swipe'
          return z
        })
      }
      return
    }

    if (g.pointers.size > 0) return
    const dx = e.clientX - g.start.x
    const dy = e.clientY - g.start.y
    const mode = g.mode
    g.mode = 'idle'

    if (mode === 'swipe' && g.base.s === 1) {
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5 && index !== null) {
        const next = dx < 0 ? index + 1 : index - 1
        onNavigateAction((next + urls.length) % urls.length)
        return
      }
      // Below threshold — check for a double-tap (second tap zooms).
      const now = Date.now()
      const tapGap = now - g.lastTap.t
      const tapDist = Math.hypot(e.clientX - g.lastTap.x, e.clientY - g.lastTap.y)
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && tapGap < TAP_MS && tapDist < 30) {
        g.lastTap = { t: 0, x: 0, y: 0 }
        if (zoom.s <= 1) zoomAt(DOUBLE_TAP_SCALE, e.clientX, e.clientY)
        else setZoom(IDLE_ZOOM)
        g.suppressClick = true
        return
      }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        g.lastTap = { t: now, x: e.clientX, y: e.clientY }
      }
      // Snap back — the transition animates translateX to zero.
      setZoom(IDLE_ZOOM)
      return
    }

    if (mode === 'pan') {
      setZoom((z) => ({ s: z.s, ...clampPan(z.s, z.x, z.y) }))
    }
  }

  if (!open) return null

  return createPortal(
    <div
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className="fixed inset-0 z-50 flex touch-none select-none items-center justify-center p-4 sm:p-10"
    >
      <div
        className={`absolute inset-0 bg-black/85 backdrop-blur-sm ${
          closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
        }`}
        onClick={() => {
          if (gesture.current.suppressClick) {
            gesture.current.suppressClick = false
            return
          }
          close()
        }}
      />

      <div
        className={`relative max-h-full max-w-full ${
          gesturing ? '' : 'transition-transform duration-200 ease-out'
        }`}
        style={{
          transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
        }}
      >
        <BlurImage
          key={index}
          src={toCdnUrl(urls[index])}
          alt=""
          className={`max-h-[calc(100dvh-2rem)] max-w-full rounded-xl object-contain shadow-2xl sm:max-h-[calc(100dvh-5rem)] ${
            closing ? 'motion-safe:animate-dialog-out' : 'motion-safe:animate-dialog-in'
          }`}
          draggable={false}
        />
      </div>

      {/* Top-right controls: download + close */}
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex items-center gap-2">
        <button
          type="button"
          onClick={download}
          disabled={downloading}
          aria-label="Download image"
          className="rounded-full bg-white/10 p-2.5 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
        >
          <DownloadIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="rounded-full bg-white/10 p-2.5 text-white backdrop-blur transition hover:bg-white/25"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {urls.length > 1 && (
        <>
          <span className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
            {index + 1} / {urls.length}
          </span>
          <button
            type="button"
            onClick={() => onNavigateAction((index - 1 + urls.length) % urls.length)}
            aria-label="Previous image"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white backdrop-blur transition hover:bg-white/25"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => onNavigateAction((index + 1) % urls.length)}
            aria-label="Next image"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white backdrop-blur transition hover:bg-white/25"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        </>
      )}
    </div>,
    document.body,
  )
})

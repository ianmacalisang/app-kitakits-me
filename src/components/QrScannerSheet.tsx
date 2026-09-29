'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QrScanner from 'qr-scanner'

import { connectPathFromUrl } from '@/lib/connect-path'

import { BrandMark } from './Branding'
import { ScanIcon, XIcon } from './icons'

// "Open Scanner" — full-screen camera overlay. The decoded payload is
// only trusted when it resolves to a same-origin /connect/<username> path;
// anything else just flashes a hint.
export function QrScanButton({ appName }: { appName: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Full-width row on small screens; stacked in the narrow column
        // beside the how-it-works card from sm up.
        className="glass flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-neutral-700 transition-transform active:scale-[0.98] sm:h-full sm:flex-col sm:gap-1.5 sm:py-2.5 sm:text-xs"
      >
        <ScanIcon className="h-5 w-5 text-accent-600" />
        Open Scanner
      </button>
      {open && <QrScannerSheet appName={appName} onClose={close} />}
    </>
  )
}

function QrScannerSheet({ appName, onClose }: { appName: string; onClose: () => void }) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<number>(0)

  const flash = useCallback((msg: string) => {
    setHint(msg)
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 2500)
  }, [])

  const close = useCallback(() => onClose(), [onClose])

  // Lock scroll and support Escape while the scanner is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [close])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let scanner: QrScanner | null = null
    let alive = true

    const release = () => {
      scanner?.destroy()
      scanner = null
    }

    const start = async () => {
      try {
        if (!(await QrScanner.hasCamera())) {
          if (alive) setError('No camera found on this device.')
          return
        }
        if (!alive) return
        const instance = new QrScanner(
          video,
          (result) => {
            const path = connectPathFromUrl(result.data, window.location.origin)
            if (path) {
              router.push(path)
              onClose()
            } else {
              flash(`That isn't a ${appName} code`)
            }
          },
          { preferredCamera: 'environment', maxScansPerSecond: 5 },
        )
        scanner = instance
        await instance.start()
        // Closed while the permission prompt/start was still pending — without
        // this the freshly-acquired stream would stay on with no scanner UI.
        if (!alive) instance.destroy()
      } catch {
        // A start() rejection can still leave a partially-acquired stream.
        release()
        if (alive) setError('Camera access was denied — allow it and reopen the scanner.')
      }
    }
    void start()

    // Release the camera while the tab is hidden; scanning resumes on return.
    const onVisibility = () => {
      if (!scanner) return
      if (document.hidden) {
        scanner.stop()
      } else {
        scanner.start().catch(() => {
          if (alive) setError('Camera could not be restarted — reopen the scanner.')
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [appName, flash, onClose, router])

  return createPortal(
    <div className="motion-safe:animate-fade-in fixed inset-0 z-50 bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Viewfinder — the box-shadow darkens everything outside the window. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-60 w-60 rounded-3xl shadow-[0_0_0_200vmax_rgba(0,0,0,0.55)] ring-4 ring-white/80" />
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <BrandMark size="sm" />
          <p className="text-sm font-semibold text-white drop-shadow">Scan a friend&apos;s code</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close scanner"
          className="rounded-full bg-black/50 p-2 text-white backdrop-blur transition-colors hover:bg-black/70"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {error ? (
          <p className="max-w-xs text-center text-sm text-white/90">{error}</p>
        ) : (
          <p className="rounded-full bg-black/50 px-4 py-1.5 text-xs text-white backdrop-blur">
            {hint ?? `Point the camera at a ${appName} QR code`}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}

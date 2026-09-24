'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { toCdnUrl } from '@/lib/cdn'

import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, XIcon } from './icons'

const CLOSE_MS = 220

// Full-screen image viewer with prev/next navigation and download.
// The parent owns `index`; the viewer manages its own close animation.
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
  const open = index !== null

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

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-10">
      <div
        className={`absolute inset-0 bg-black/85 backdrop-blur-sm ${
          closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
        }`}
        onClick={close}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={index}
        src={toCdnUrl(urls[index])}
        alt=""
        className={`relative max-h-full max-w-full rounded-xl object-contain shadow-2xl ${
          closing ? 'motion-safe:animate-dialog-out' : 'motion-safe:animate-dialog-in'
        }`}
      />

      {/* Top-right controls: download + close */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
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
          <span className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
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

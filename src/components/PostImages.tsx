'use client'

import { memo, useCallback, useState } from 'react'

import { toCdnUrl } from '@/lib/cdn'

import { BlurImage } from './BlurImage'
import { ImageLightbox } from './ImageLightbox'

// Count-aware image grid for posts:
//   1 → full-width natural image
//   2 → side-by-side squares
//   3 → large left tile + two stacked right
//   4+ → 2×2 grid, "+N" overlay on the last tile
// Clicking any image opens a lightbox with prev/next navigation and download.
export const PostImages = memo(function PostImages({ urls }: { urls: string[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const closeLightbox = useCallback(() => setOpenIdx(null), [])

  if (urls.length === 0) return null

  const lightbox = (
    <ImageLightbox
      urls={urls}
      index={openIdx}
      onNavigateAction={setOpenIdx}
      onCloseAction={closeLightbox}
    />
  )

  if (urls.length === 1) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpenIdx(0)}
          className="mt-3 block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-black/5"
        >
          <BlurImage
            src={toCdnUrl(urls[0])}
            alt=""
            className="max-h-[420px] w-full bg-neutral-200/70 object-cover transition-transform duration-300 hover:scale-[1.02]"
          />
        </button>
        {lightbox}
      </>
    )
  }

  const shown = urls.slice(0, 4)
  const extra = urls.length - shown.length
  const three = shown.length === 3

  return (
    <>
      <div
        className={`mt-3 grid gap-1 overflow-hidden rounded-2xl border border-black/5 ${
          three ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'
        }`}
      >
        {shown.map((url, i) => (
          <button
            key={url + i}
            type="button"
            onClick={() => setOpenIdx(i)}
            className={`relative cursor-zoom-in overflow-hidden ${
              three && i === 0 ? 'row-span-2' : ''
            }`}
          >
            <BlurImage
              src={toCdnUrl(url)}
              alt=""
              className={`w-full bg-neutral-200/70 object-cover transition-transform duration-300 hover:scale-105 ${
                three && i === 0 ? 'h-full' : 'aspect-square'
              }`}
            />
            {extra > 0 && i === shown.length - 1 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xl font-semibold text-white">
                +{extra}
              </span>
            )}
          </button>
        ))}
      </div>
      {lightbox}
    </>
  )
})

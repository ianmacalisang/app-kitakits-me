'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { CATEGORY_TINTS, POST_CATEGORIES, type PostCategory } from '@/lib/categories'

import { CATEGORY_ICONS } from './CategoryChip'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

export function CategoryPicker({
  value,
  onChange,
}: {
  value: PostCategory | null
  onChange: (value: PostCategory | null) => void
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateEdges = useCallback(() => {
    const el = railRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 2)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2)
  }, [])

  useEffect(() => {
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges])

  const scrollBy = (dir: 1 | -1) => {
    const el = railRef.current
    el?.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' })
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Category</p>
        <p className="text-[11px] text-neutral-400">
          {value ? 'Tap again to remove' : 'Defaults to Random'}
        </p>
      </div>
      <div className="relative mt-1.5">
        <div
          ref={railRef}
          onScroll={updateEdges}
          className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto scroll-smooth px-1 pb-0.5 pt-0.5"
        >
          {POST_CATEGORIES.map((c) => {
            const active = value === c.value
            const tint = CATEGORY_TINTS[c.tint]
            const Icon = CATEGORY_ICONS[c.icon]
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? null : c.value)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                  active ? tint.chipActive : tint.chip
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {c.label}
              </button>
            )
          })}
        </div>

        {canLeft && (
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll categories left"
            className="glass absolute -left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full shadow-sm"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {canRight && (
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Scroll categories right"
            className="glass absolute -right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full shadow-sm"
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

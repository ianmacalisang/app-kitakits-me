'use client'

import { useEffect, useRef, useState } from 'react'

import type { BadgeProgressData } from '@/lib/serialize'

import { BADGE_ICON_COMPONENTS, BADGE_TIER_STYLES } from './BadgeShelf'
import { ChevronLeftIcon, ChevronRightIcon, MedalIcon } from './icons'

// Earned-badge panel above the profile tabs — a horizontal rail of every badge
// the user has unlocked. Locked badges stay hidden; requirement progress is
// what motivates, but only achievements belong on the public profile.
export function BadgeProgressPanel({ badges }: { badges: BadgeProgressData[] }) {
  const railRef = useRef<HTMLUListElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const earned = badges.filter((b) => b.earned)

  useEffect(() => {
    const rail = railRef.current
    if (!rail || earned.length === 0) return
    const updateEdges = () => {
      setCanScrollLeft(rail.scrollLeft > 4)
      setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4)
    }
    updateEdges()
    rail.addEventListener('scroll', updateEdges, { passive: true })
    window.addEventListener('resize', updateEdges)
    return () => {
      rail.removeEventListener('scroll', updateEdges)
      window.removeEventListener('resize', updateEdges)
    }
  }, [earned.length])

  if (earned.length === 0) return null

  const scrollRail = (dir: 1 | -1) =>
    railRef.current?.scrollBy({
      left: dir * railRef.current.clientWidth * 0.85,
      behavior: 'smooth',
    })

  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold">Badges</h2>
        <span className="rounded-full bg-accent-500/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-accent-700 dark:text-accent-300">
          {earned.length} earned
        </span>
      </div>

      <div className="relative">
        <ul
          ref={railRef}
          className="no-scrollbar flex gap-2 overflow-x-auto py-1 [mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]"
        >
          {earned.map((badge) => {
            const Icon =
              BADGE_ICON_COMPONENTS[badge.icon as keyof typeof BADGE_ICON_COMPONENTS] ?? MedalIcon
            return (
              <li
                key={badge.slug}
                title={badge.description ?? badge.name}
                className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-white/70 py-2 pl-2 pr-3.5 ring-1 ring-black/[0.06] transition-transform hover:-translate-y-0.5 dark:bg-white/[0.06] dark:ring-white/10"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${BADGE_TIER_STYLES[badge.tier].solid}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {badge.name}
                  </span>
                  <span
                    className={`block truncate text-[11px] font-medium capitalize leading-tight ${BADGE_TIER_STYLES[badge.tier].text}`}
                  >
                    {badge.tier}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollRail(-1)}
            className="glass absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollRail(1)}
            className="glass absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 shadow-md transition-all hover:text-accent-600 active:scale-95"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  )
}

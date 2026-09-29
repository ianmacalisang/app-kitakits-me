import type { LevelInfo } from '@/lib/levels'

import { TrophyIcon } from './icons'

// "Sikat" pill — the tooltip explains progress toward the next level.
// `light` renders the frosted variant for chips over cover photos.
export function LevelChip({
  level,
  points,
  light = false,
}: {
  level: LevelInfo
  points: number
  light?: boolean
}) {
  const progress = level.nextAt
    ? `${points} pts · ${level.nextAt - points} to next level`
    : `${points} pts · max level`

  return (
    <span
      title={progress}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        light
          ? 'bg-white/15 text-white/90 ring-white/25 backdrop-blur'
          : 'bg-accent-500/10 text-accent-700 ring-accent-500/20'
      }`}
    >
      <TrophyIcon className="h-3.5 w-3.5" />
      {level.name}
    </span>
  )
}

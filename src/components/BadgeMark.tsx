import type { BadgeData } from '@/lib/serialize'

import { BADGE_ICON_COMPONENTS } from './BadgeShelf'
import { MedalIcon } from './icons'

// Compact badge mark rendered inline beside a user's name — a small
// medallion with the badge name/description on hover. `light` is for names
// that sit on cover-photo scrims. `className` sizes the outer disc; the icon
// inside scales to ~62% of it. Uses the accent scale so it matches the app
// accent in-app and the profile accent on public pages.
const DISC =
  'bg-gradient-to-br from-accent-400 to-accent-700 text-white ring-accent-900/20 dark:from-accent-400 dark:to-accent-800'

export function BadgeMark({
  badge,
  light = false,
  className = 'h-4 w-4',
}: {
  badge?: BadgeData | null
  light?: boolean
  className?: string
}) {
  if (!badge) return null
  const Icon = BADGE_ICON_COMPONENTS[badge.icon as keyof typeof BADGE_ICON_COMPONENTS] ?? MedalIcon
  const tooltip = badge.description ? `${badge.name} — ${badge.description}` : badge.name
  return (
    <span
      role="img"
      aria-label={badge.name}
      title={tooltip}
      className={`inline-flex shrink-0 translate-y-[-0.06em] items-center justify-center rounded-full align-middle shadow-sm ring-1 ring-inset transition-transform hover:scale-110 ${
        light ? 'bg-white/20 text-white ring-white/40 backdrop-blur' : DISC
      } ${className}`}
    >
      <Icon aria-hidden className="h-[62%] w-[62%]" />
    </span>
  )
}

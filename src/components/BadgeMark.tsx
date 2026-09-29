import type { BadgeData } from '@/lib/serialize'

import { BADGE_ICON_COMPONENTS, BADGE_TIER_STYLES } from './BadgeShelf'
import { MedalIcon } from './icons'

// Compact badge mark rendered inline beside a user's name — a small
// medallion with the badge name/description on hover, flat-filled with the
// badge's tier color. `light` is for names that sit on cover-photo scrims.
// `className` sizes the outer disc; the icon inside scales to ~62% of it.

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
      className={`inline-flex shrink-0 translate-y-[-0.06em] items-center justify-center rounded-full align-middle transition-transform hover:scale-110 ${
        light
          ? 'bg-white/20 text-white ring-1 ring-inset ring-white/40 backdrop-blur'
          : BADGE_TIER_STYLES[badge.tier].solid
      } ${className}`}
    >
      <Icon aria-hidden className="h-[62%] w-[62%]" />
    </span>
  )
}

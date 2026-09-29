import type { BadgeData } from '@/lib/serialize'

import {
  HeartIcon,
  MegaphoneIcon,
  MedalIcon,
  PinIcon,
  QuoteIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
  UsersIcon,
} from './icons'

// Badge.icon values come from the badges collection's select field.
export const BADGE_ICON_COMPONENTS = {
  sparkles: SparklesIcon,
  heart: HeartIcon,
  users: UsersIcon,
  quote: QuoteIcon,
  trophy: TrophyIcon,
  medal: MedalIcon,
  star: StarIcon,
  pin: PinIcon,
  megaphone: MegaphoneIcon,
} as const

// Chips use the accent scale so they follow the app accent in-app and the
// profile accent on public pages.
const CHIP_STYLE = 'bg-accent-500/10 text-accent-700 ring-accent-500/20 dark:text-accent-300'

const earnedLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

// Row of earned badges for profile headers. `light` renders the frosted
// variant for chips sitting over cover photos.
export function BadgeShelf({ badges, light = false }: { badges: BadgeData[]; light?: boolean }) {
  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges.map((badge) => {
        const Icon =
          BADGE_ICON_COMPONENTS[badge.icon as keyof typeof BADGE_ICON_COMPONENTS] ?? MedalIcon
        const tooltip = [badge.description, `Earned ${earnedLabel(badge.awardedAt)}`]
          .filter(Boolean)
          .join(' · ')
        return (
          <span
            key={badge.slug}
            title={tooltip || badge.name}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
              light ? 'bg-white/15 text-white ring-white/30 backdrop-blur' : CHIP_STYLE
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {badge.name}
          </span>
        )
      })}
    </div>
  )
}

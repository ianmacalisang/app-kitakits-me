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

// Tier styles — flat, solid fills so bronze/silver/gold read at a glance.
// `soft` tints a highlighted row; `text` colors the tier label.
export const BADGE_TIER_STYLES = {
  bronze: {
    solid: 'bg-amber-700 text-white',
    soft: 'bg-amber-700/10 ring-amber-700/30',
    text: 'text-amber-700 dark:text-amber-500',
  },
  silver: {
    solid: 'bg-slate-300 text-slate-600',
    soft: 'bg-slate-400/15 ring-slate-400/40',
    text: 'text-slate-500 dark:text-slate-400',
  },
  gold: {
    solid: 'bg-amber-400 text-amber-950',
    soft: 'bg-amber-400/15 ring-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
} as const

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
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              light
                ? 'bg-white/15 text-white ring-1 ring-inset ring-white/30 backdrop-blur'
                : BADGE_TIER_STYLES[badge.tier].solid
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

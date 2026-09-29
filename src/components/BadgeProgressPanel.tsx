import type { BadgeProgressData } from '@/lib/serialize'

import { BADGE_ICON_COMPONENTS } from './BadgeShelf'
import { MedalIcon } from './icons'

// Accent-driven so the panel follows the app accent in-app and the profile
// accent (data-profile-accent) on public pages.
const DISC = 'bg-gradient-to-br from-accent-400 to-accent-700 text-white ring-accent-900/20'

// Earned-badge panel above the profile tabs — a clean wrap of every badge the
// user has unlocked. Locked badges stay hidden; requirement progress is what
// motivates, but only achievements belong on the public profile.
export function BadgeProgressPanel({ badges }: { badges: BadgeProgressData[] }) {
  const earned = badges.filter((b) => b.earned)
  if (earned.length === 0) return null

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold">Badges</h2>
        <span className="rounded-full bg-accent-500/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-accent-700 dark:text-accent-300">
          {earned.length} earned
        </span>
      </div>

      <ul className="flex flex-wrap gap-2">
        {earned.map((badge) => {
          const Icon =
            BADGE_ICON_COMPONENTS[badge.icon as keyof typeof BADGE_ICON_COMPONENTS] ?? MedalIcon
          return (
            <li
              key={badge.slug}
              title={badge.description ?? badge.name}
              className="flex items-center gap-2.5 rounded-2xl bg-white/70 py-2 pl-2 pr-3.5 ring-1 ring-black/[0.06] transition-transform hover:-translate-y-0.5 dark:bg-white/[0.06] dark:ring-white/10"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-inset ${DISC}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight">
                  {badge.name}
                </span>
                <span className="block truncate text-[11px] font-medium capitalize leading-tight text-accent-600 dark:text-accent-300">
                  {badge.tier}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

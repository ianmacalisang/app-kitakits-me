import Link from 'next/link'

import { ArrowUpRightIcon, MicIcon, MusicIcon } from './icons'
import { EqBars } from './videoke/EqBars'

// The Hangouts tab's in-app apps list — one card per mini-app. Each card
// links to the app's own route tree, where its lobby and live views live.
const APPS = [
  {
    href: '/hangouts/videoke',
    title: 'Videoke',
    tag: 'Sing together',
    blurb: 'Open a karaoke room, invite your mutuals, and queue songs from YouTube.',
    icon: MicIcon,
  },
] as const

export function HangoutsApps() {
  return (
    <section>
      <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Apps
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {APPS.map(({ href, title, tag, blurb, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="glass group block overflow-hidden rounded-3xl transition-all hover:shadow-lg active:scale-[0.99]"
            >
              {/* Stage cover — karaoke gradient with a mic pedestal + live EQ */}
              <div className="relative h-32 overflow-hidden bg-gradient-to-br from-accent-500 via-accent-700 to-accent-950">
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
                />
                <span
                  aria-hidden
                  className="absolute -top-10 left-1/2 h-24 w-40 -translate-x-1/2 rounded-full bg-white/20 blur-2xl"
                />
                <MusicIcon
                  aria-hidden
                  className="absolute left-5 top-5 h-5 w-5 -rotate-12 text-white/35 transition-transform duration-500 group-hover:-translate-y-1"
                />
                <MusicIcon
                  aria-hidden
                  className="absolute right-8 top-4 h-4 w-4 rotate-12 text-white/25 transition-transform duration-500 group-hover:-translate-y-1"
                />
                <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/40 backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-7 w-7" />
                </span>
                <EqBars className="absolute bottom-3 right-4 h-5 text-white/70" />
              </div>

              {/* Body */}
              <div className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-base font-bold tracking-tight">{title}</span>
                    <span className="shrink-0 rounded-full bg-accent-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-600">
                      {tag}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-neutral-500">
                    {blurb}
                  </span>
                </span>
                <span className="btn-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                  <ArrowUpRightIcon className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

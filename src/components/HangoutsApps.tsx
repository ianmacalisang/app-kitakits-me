import Link from 'next/link'
import type { ReactNode } from 'react'

import type { HangoutPresence } from '@/actions/hangouts'

import { Avatar } from './Avatar'
import { ArrowUpRightIcon, CardIcon, HandIcon, MicIcon, MusicIcon } from './icons'
import { EqBars } from './videoke/EqBars'

// The Hangouts tab's in-app apps list — one card per mini-app, each with its
// own cover palette, motif, and tag tint. Cards link to the app's route tree.
const APPS: {
  href: string
  kind: 'videoke' | 'cards' | 'nhie'
  title: string
  tag: string
  tagClass: string
  blurb: string
  icon: typeof MicIcon
  cover: string
  decor?: ReactNode
}[] = [
  {
    href: '/hangouts/videoke',
    kind: 'videoke',
    title: 'Videoke',
    tag: 'Sing together',
    tagClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    blurb: 'Open a karaoke room, invite your mutuals, and queue songs from YouTube.',
    icon: MicIcon,
    cover: 'from-fuchsia-500 via-rose-600 to-purple-950',
    decor: (
      <>
        <MusicIcon
          aria-hidden
          className="absolute left-6 top-5 h-5 w-5 -rotate-12 text-white/35 transition-transform duration-500 group-hover:-translate-y-1"
        />
        <MusicIcon
          aria-hidden
          className="absolute right-9 top-6 h-4 w-4 rotate-12 text-white/25 transition-transform duration-500 group-hover:-translate-y-1"
        />
        <MusicIcon
          aria-hidden
          className="absolute right-14 bottom-6 h-3.5 w-3.5 -rotate-6 text-white/20"
        />
        <EqBars className="absolute bottom-3 right-4 h-5 text-white/70" />
      </>
    ),
  },
  {
    href: '/hangouts/cards',
    kind: 'cards',
    title: 'Unggoy-Unggoy',
    tag: 'Card game',
    tagClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    blurb: 'Deal a round of Unggoy-Ungguyan — don’t get stuck holding the monkey.',
    icon: CardIcon,
    cover: 'from-emerald-500 via-teal-700 to-emerald-950',
    decor: (
      <>
        <span aria-hidden className="absolute left-5 top-4 text-xl font-black text-white/20">
          ♠
        </span>
        <span
          aria-hidden
          className="absolute right-8 top-4 rotate-12 text-2xl font-black text-white/15"
        >
          ♥
        </span>
        <span
          aria-hidden
          className="absolute bottom-4 left-10 -rotate-6 text-lg font-black text-white/15"
        >
          ♦
        </span>
        <span
          aria-hidden
          className="absolute bottom-5 right-16 rotate-6 text-base font-black text-white/20"
        >
          ♣
        </span>
        {/* A fanned pair of cards lying on the felt, bottom-right corner */}
        <span
          aria-hidden
          className="absolute -bottom-5 right-5 h-16 w-11 rotate-12 rounded-lg bg-white/10 ring-1 ring-white/25"
        />
        <span
          aria-hidden
          className="absolute -bottom-4 right-11 h-16 w-11 -rotate-6 rounded-lg bg-white/5 ring-1 ring-white/15"
        />
      </>
    ),
  },
  {
    href: '/hangouts/nhie',
    kind: 'nhie',
    title: 'Never Have I Ever',
    tag: 'Party game',
    tagClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    blurb: 'Confess or keep your fingers up — last one standing wins the round.',
    icon: HandIcon,
    cover: 'from-amber-400 via-orange-600 to-rose-950',
    decor: (
      <>
        <span aria-hidden className="absolute left-6 top-4 text-xl font-black text-white/25">
          ?
        </span>
        <span
          aria-hidden
          className="absolute right-9 top-5 rotate-12 text-lg font-black text-white/20"
        >
          ?
        </span>
        {/* Five fingers up — the row fades out left to right */}
        <span aria-hidden className="absolute bottom-4 right-6 flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
        </span>
      </>
    ),
  },
]

export function HangoutsApps({ presence }: { presence?: HangoutPresence }) {
  return (
    <section>
      {/* CSS-columns masonry — cards stack top-to-bottom per column, so a
          card with a mutuals footer sits taller without stretching its row. */}
      <ul className="columns-1 gap-3 space-y-3 sm:columns-2">
        {APPS.map(({ href, kind, title, tag, tagClass, blurb, icon: Icon, cover, decor }) => {
          const playing = presence?.[kind]
          return (
            <li key={href} className="break-inside-avoid">
              <Link
                href={href}
                className="glass group block overflow-hidden rounded-3xl transition-all hover:shadow-lg hover:shadow-accent-900/10 active:scale-[0.99]"
              >
                {/* Stage cover — per-app palette with its own motif */}
                <div className={`relative h-32 overflow-hidden bg-gradient-to-br ${cover}`}>
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
                  />
                  <span
                    aria-hidden
                    className="absolute -top-10 left-1/2 h-24 w-40 -translate-x-1/2 rounded-full bg-white/20 blur-2xl"
                  />
                  {decor}
                  <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/40 backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
                    <Icon className="h-7 w-7" />
                  </span>
                  {playing && playing.total > 0 && (
                    <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-300" />
                      {playing.total} inside
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="flex items-center gap-3 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-base font-bold tracking-tight">{title}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tagClass}`}
                      >
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

                {/* Mutuals inside — first 3 avatars, +X for the overflow */}
                {playing && playing.total > 0 && (
                  <div className="flex items-center gap-2 border-t border-black/5 px-4 py-2.5 dark:border-white/10">
                    <span className="flex -space-x-1.5">
                      {playing.heads.map((head) => (
                        <span
                          key={head.id}
                          className="inline-flex rounded-full ring-2 ring-white dark:ring-neutral-900"
                        >
                          <Avatar src={head.avatarUrl} name={head.name} size="xs" />
                        </span>
                      ))}
                      {playing.total > playing.heads.length && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-bold text-neutral-600 ring-2 ring-white dark:bg-neutral-700 dark:text-neutral-200 dark:ring-neutral-900">
                          +{playing.total - playing.heads.length}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium text-neutral-400">
                      {playing.total} mutual{playing.total === 1 ? '' : 's'} inside
                    </span>
                  </div>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

import { getDiscoverPosts } from '@/actions/discover'
import { BrandMark } from '@/components/Branding'
import { CATEGORY_ICONS } from '@/components/CategoryChip'
import { DiscoverFeed } from '@/components/DiscoverFeed'
import { ChevronRightIcon, CompassIcon } from '@/components/icons'
import { LandingUserSearch } from '@/components/LandingUserSearch'
import { getCurrentUser } from '@/lib/auth'
import {
  CATEGORY_TINTS,
  POST_CATEGORIES,
  isPostCategory,
  postCategory,
  type PostCategory,
} from '@/lib/categories'
import { getSiteSettings } from '@/lib/settings'

export const metadata: Metadata = { title: 'Discover' }

// Category filter chip — a Link rather than a button because switching the
// filter is a navigation (?category=), not client state.
function CategoryLink({
  href,
  label,
  icon: Icon,
  tint,
  active,
}: {
  href: string
  label: string
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  tint?: (typeof POST_CATEGORIES)[number]['tint']
  active: boolean
}) {
  const tintClasses = tint ? CATEGORY_TINTS[tint] : undefined
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? (tintClasses?.chipActive ??
            'border-transparent bg-accent-600 text-white shadow-md shadow-accent-600/30')
          : (tintClasses?.chip ??
            'border-black/10 bg-black/5 text-neutral-600 hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10')
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </Link>
  )
}

// Decorative floating category tile in the hero — a mini preview of the
// filter rail inside the card. --float-rotate keeps a slight tilt while the
// float-chip keyframes bob it; hidden on narrow screens where the card's
// content spans nearly the full width.
function FloatTile({
  className,
  icon: Icon,
  tint,
  rotate,
  delay,
}: {
  className: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  tint: (typeof POST_CATEGORIES)[number]['tint']
  rotate: string
  delay: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`glass-pop pointer-events-none absolute hidden h-10 w-10 items-center justify-center rounded-2xl shadow-lg motion-safe:animate-float-chip ${className}`}
      style={{ '--float-rotate': rotate, animationDelay: delay } as React.CSSProperties}
    >
      <Icon className={`h-4 w-4 ${CATEGORY_TINTS[tint].icon}`} />
    </span>
  )
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category: rawCategory } = await searchParams
  const category: PostCategory | 'all' = isPostCategory(rawCategory) ? rawCategory : 'all'
  const active = category === 'all' ? undefined : postCategory(category)
  const ActiveIcon = active ? CATEGORY_ICONS[active.icon] : undefined

  const [viewer, settings] = await Promise.all([getCurrentUser(), getSiteSettings()])

  // First page server-rendered for every view — 'all' or a single
  // category; DiscoverFeed appends further pages via the same action.
  const initial = await getDiscoverPosts(category, 1)

  return (
    <main className="animate-page-in">
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <BrandMark size="sm" />
          </Link>
          {viewer ? (
            <Link href="/home" className="btn-primary rounded-full px-4 py-2 text-xs font-semibold">
              Go to Profile
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="glass rounded-full px-4 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:text-neutral-900"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="btn-primary rounded-full px-4 py-2 text-xs font-semibold"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>

        {/* Hero — glass card echoing the Explore header, with a grid
            backdrop, floating category tiles, and the filter rail as the
            card's footer. z-10 lets the search dropdown overflow the card
            edge and still paint above the posts below. */}
        <section className="glass relative z-10 mt-6 rounded-[2rem] px-4 pb-6 pt-9 text-center sm:px-8 sm:pt-11">
          {/* Clipped decorative layer — keeps the grid + glow inside the
              rounded corners without clipping the search dropdown. */}
          <div className="absolute inset-0 overflow-hidden rounded-[2rem]" aria-hidden="true">
            <span className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.045)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_78%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)]" />
            <span className="absolute -top-24 left-1/2 h-48 w-[30rem] -translate-x-1/2 rounded-full bg-accent-400/15 blur-3xl" />
          </div>

          {/* Floating category tiles — a decorative preview of the rail */}
          <FloatTile
            icon={CATEGORY_ICONS.book}
            tint="amber"
            rotate="-8deg"
            delay="0.3s"
            className="left-5 top-8 sm:flex"
          />
          <FloatTile
            icon={CATEGORY_ICONS.heart}
            tint="rose"
            rotate="7deg"
            delay="1.2s"
            className="right-6 top-10 sm:flex"
          />
          <FloatTile
            icon={CATEGORY_ICONS.question}
            tint="sky"
            rotate="5deg"
            delay="2.4s"
            className="left-[14%] top-14 md:flex"
          />
          <FloatTile
            icon={CATEGORY_ICONS.music}
            tint="violet"
            rotate="-5deg"
            delay="1.9s"
            className="bottom-14 left-9 md:flex"
          />
          <FloatTile
            icon={CATEGORY_ICONS.car}
            tint="emerald"
            rotate="6deg"
            delay="2.8s"
            className="bottom-16 right-9 md:flex"
          />

          <div className="relative flex flex-col items-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3.5 py-1.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-500/20">
              <CompassIcon className="h-3.5 w-3.5" />
              Bukas sa lahat — kahit walang account
            </span>
            <h1 className="mt-5 flex items-center justify-center gap-3 text-4xl font-bold tracking-tight sm:text-5xl">
              {active && ActiveIcon && (
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border sm:h-13 sm:w-13 ${CATEGORY_TINTS[active.tint].chip}`}
                >
                  <ActiveIcon
                    className={`h-5 w-5 sm:h-6 sm:w-6 ${CATEGORY_TINTS[active.tint].icon}`}
                  />
                </span>
              )}
              <span className="relative whitespace-nowrap bg-gradient-to-br from-accent-700 via-accent-600 to-accent-600 bg-clip-text text-transparent">
                {active?.label ?? 'Discover'}
                <svg
                  className="absolute -bottom-1.5 left-0 h-2 w-full text-accent-500/70"
                  viewBox="0 0 120 8"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 6C30 2 60 2 118 5"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="mt-4 max-w-md text-balance text-sm leading-relaxed text-neutral-600 sm:text-base">
              {active
                ? `Pinakabagong public posts sa ${active.label} — bukas sa lahat.`
                : 'Mga kwento, tanong, at gala mula sa community — open to everyone.'}
            </p>
            {!viewer && (
              <div className="mt-7 w-full">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-accent-600">
                  Hanapin ang tropa mo
                </p>
                <LandingUserSearch />
              </div>
            )}

            {/* Category filter rail — the hero card's footer */}
            <nav
              aria-label="Post categories"
              className="mt-8 flex flex-wrap items-center justify-center gap-1.5 border-t border-black/5 pt-6"
            >
              <CategoryLink href="/discover" label="All" active={category === 'all'} />
              {POST_CATEGORIES.map((c) => (
                <CategoryLink
                  key={c.value}
                  href={`/discover?category=${c.value}`}
                  label={c.label}
                  icon={CATEGORY_ICONS[c.icon]}
                  tint={c.tint}
                  active={category === c.value}
                />
              ))}
            </nav>
          </div>
        </section>

        <div className="mt-6">
          <DiscoverFeed
            key={category}
            category={category}
            initialPosts={initial.items}
            initialHasMore={initial.hasMore}
          />
        </div>

        {!viewer && (
          <section className="mt-14">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-accent-600 via-accent-500 to-accent-600 px-6 py-10 text-center shadow-xl shadow-accent-600/30 sm:px-10">
              <div
                className="absolute -top-24 left-1/2 h-56 w-[32rem] -translate-x-1/2 rounded-full bg-white/20 blur-3xl"
                aria-hidden="true"
              />
              <h2 className="relative text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Sali ka na sa kwento.
              </h2>
              <p className="relative mx-auto mt-3 max-w-sm text-sm leading-relaxed text-accent-50/90">
                Mag-post, mag-follow, at mag-mail — kasama ka sa {settings.appName} community in a
                minute.
              </p>
              <Link
                href="/register"
                className="relative mt-6 inline-flex items-center gap-1.5 rounded-full bg-white px-7 py-3 text-sm font-bold text-accent-700 shadow-lg transition-all hover:scale-[1.03] hover:shadow-xl active:scale-[0.98]"
              >
                Gumawa ka na — libre lang
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
              <p className="relative mt-4 text-xs text-accent-100/80">
                May account ka na?{' '}
                <Link
                  href="/login"
                  className="font-semibold text-white underline-offset-2 hover:underline"
                >
                  Log in
                </Link>
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

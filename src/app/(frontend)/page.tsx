import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BrandMark } from '@/components/Branding'
import {
  BookmarkIcon,
  CheckIcon,
  ChevronRightIcon,
  CommentIcon,
  CompassIcon,
  HeartIcon,
  HomeIcon,
  ImageIcon,
  LockIcon,
  MailboxIcon,
  MailIcon,
  MonitorIcon,
  MoonIcon,
  QuoteIcon,
  SearchIcon,
  SparklesIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from '@/components/icons'
import { LandingUserSearch } from '@/components/LandingUserSearch'
import { getCurrentUser } from '@/lib/auth'
import { getSiteSettings } from '@/lib/settings'

type Feature = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  title: string
  description: string
  // Tiny wireframe mock of the feature's UI — decorative, rendered aria-hidden.
  preview: React.ReactNode
  // Featured cards span two columns with a taller preview — the headline
  // feature (feed) up top, testimonials closing the grid.
  featured?: boolean
}

// Shared building blocks for the previews: soft neutral bars read as text,
// gradient discs read as avatars — the same wireframe shorthand the app's
// empty states and template previews use.
const Bar = ({ className }: { className: string }) => (
  <span className={`block h-1.5 rounded-full ${className}`} />
)
const Disc = ({ className }: { className: string }) => (
  <span className={`block shrink-0 rounded-full ${className}`} />
)
const MiniRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200/60 bg-white/70 px-2 py-1.5">
    {children}
  </div>
)

const FEATURES: Feature[] = [
  {
    icon: HomeIcon,
    featured: true,
    title: 'Feed na may respeto sa’yo',
    description:
      'Chronological posts mula sa mga fina-follow mo talaga. Walang nagdedecide kung ano ang dapat mong makita — ikaw lang.',
    preview: (
      <div className="flex flex-col gap-1.5">
        <div className="rounded-lg border border-neutral-200/60 bg-white/70 p-2">
          <div className="flex items-center gap-1.5">
            <Disc className="h-4 w-4 bg-gradient-to-br from-accent-400 to-accent-500" />
            <Bar className="w-12 bg-neutral-300" />
            <Bar className="ml-auto w-5 bg-neutral-200" />
          </div>
          <div className="mt-1.5 flex flex-col gap-1">
            <Bar className="w-full bg-neutral-200" />
            <Bar className="w-2/3 bg-neutral-200" />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-neutral-300">
            <HeartIcon filled className="h-2.5 w-2.5 text-accent-500" />
            <CommentIcon className="h-2.5 w-2.5" />
            <BookmarkIcon className="h-2.5 w-2.5" />
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200/60 bg-white/70 p-2 opacity-60">
          <div className="flex items-center gap-1.5">
            <Disc className="h-4 w-4 bg-gradient-to-br from-accent-400 to-accent-500" />
            <Bar className="w-10 bg-neutral-300" />
          </div>
          <Bar className="mt-1.5 w-3/4 bg-neutral-200" />
        </div>
      </div>
    ),
  },
  {
    icon: MailboxIcon,
    title: 'Mail, hindi DMs',
    description:
      'Rich, thoughtful na messages na may attachments — parang sulat, hindi chat bubble.',
    preview: (
      <div className="flex flex-col gap-1.5">
        <MiniRow>
          <Disc className="h-4 w-4 bg-gradient-to-br from-accent-400 to-accent-500" />
          <span className="min-w-0 flex-1">
            <Bar className="w-12 bg-neutral-300" />
            <Bar className="mt-1 w-20 bg-neutral-200" />
          </span>
          <Disc className="h-1.5 w-1.5 bg-accent-500" />
        </MiniRow>
        <MiniRow>
          <Disc className="h-4 w-4 bg-gradient-to-br from-accent-400 to-accent-500" />
          <span className="min-w-0 flex-1">
            <Bar className="w-14 bg-neutral-300" />
            <Bar className="mt-1 w-16 bg-neutral-200" />
          </span>
          <Disc className="h-1.5 w-1.5 bg-accent-500" />
        </MiniRow>
        <MiniRow>
          <Disc className="h-4 w-4 bg-neutral-300" />
          <span className="min-w-0 flex-1">
            <Bar className="w-10 bg-neutral-300" />
            <Bar className="mt-1 w-24 bg-neutral-200" />
          </span>
        </MiniRow>
      </div>
    ),
  },
  {
    icon: CompassIcon,
    title: 'Hanapin ang tropa mo',
    description:
      'Mag-search at mag-explore ng totoong posts at profiles sa community — walang promoted, walang boosted.',
    preview: (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 rounded-full border border-neutral-200/60 bg-white/70 px-2.5 py-1.5">
          <SearchIcon className="h-2.5 w-2.5 shrink-0 text-neutral-400" />
          <Bar className="w-16 bg-neutral-200" />
        </div>
        <MiniRow>
          <Disc className="h-4 w-4 bg-gradient-to-br from-accent-400 to-accent-500" />
          <Bar className="w-16 bg-neutral-300" />
          <span className="ml-auto h-3 w-8 rounded-full bg-accent-500/15" />
        </MiniRow>
        <MiniRow>
          <Disc className="h-4 w-4 bg-gradient-to-br from-accent-400 to-accent-500" />
          <Bar className="w-12 bg-neutral-300" />
          <span className="ml-auto h-3 w-8 rounded-full bg-accent-500/15" />
        </MiniRow>
      </div>
    ),
  },
  {
    icon: UserIcon,
    title: 'Profile na sa’yo talaga',
    description:
      'Avatar, cover, bio, links, at isang shareable na @handle page na pwede mong i-public.',
    preview: (
      <div className="overflow-hidden rounded-lg border border-neutral-200/60 bg-white/70">
        <div className="h-9 bg-gradient-to-r from-accent-400/70 via-accent-400/60 to-accent-400/60" />
        <div className="px-2.5 pb-2.5">
          <Disc className="-mt-2.5 h-6 w-6 border-2 border-white bg-gradient-to-br from-accent-400 to-accent-600" />
          <Bar className="mt-1.5 w-16 bg-neutral-300" />
          <Bar className="mt-1 w-10 bg-neutral-200" />
          <div className="mt-2 flex gap-1">
            <span className="h-2.5 w-9 rounded-full bg-accent-500/15" />
            <span className="h-2.5 w-12 rounded-full bg-neutral-200" />
            <span className="h-2.5 w-8 rounded-full bg-neutral-200" />
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: LockIcon,
    title: 'Privacy na ikaw ang bahala',
    description:
      'Mag-private, post to followers only, at piliin kung sino ang pwedeng mag-mail sa’yo.',
    preview: (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between rounded-lg border border-neutral-200/60 bg-white/70 px-2.5 py-2">
          <span>
            <Bar className="w-16 bg-neutral-300" />
            <Bar className="mt-1 w-20 bg-neutral-200" />
          </span>
          {/* Toggle on */}
          <span className="flex h-3.5 w-6 items-center rounded-full bg-accent-500 px-0.5">
            <Disc className="ml-auto h-2.5 w-2.5 bg-white" />
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-neutral-200/60 bg-white/70 px-2.5 py-2">
          <span>
            <Bar className="w-14 bg-neutral-300" />
            <Bar className="mt-1 w-16 bg-neutral-200" />
          </span>
          {/* Toggle off */}
          <span className="flex h-3.5 w-6 items-center rounded-full bg-neutral-300 px-0.5">
            <Disc className="h-2.5 w-2.5 bg-white" />
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: MoonIcon,
    title: 'Magaan sa mata',
    description: 'Light, dark, o system — buong app susunod sa theme mo.',
    preview: (
      <div className="flex flex-col gap-1.5">
        {/* Segmented theme switcher, mirroring the in-app control */}
        <div className="flex rounded-full bg-black/5 p-0.5">
          <span className="flex flex-1 items-center justify-center rounded-full bg-white py-1 shadow-sm">
            <SunIcon className="h-2.5 w-2.5 text-accent-600" />
          </span>
          <span className="flex flex-1 items-center justify-center py-1">
            <MoonIcon className="h-2.5 w-2.5 text-neutral-400" />
          </span>
          <span className="flex flex-1 items-center justify-center py-1">
            <MonitorIcon className="h-2.5 w-2.5 text-neutral-400" />
          </span>
        </div>
        {/* Same surface, light and dark halves */}
        <div className="flex overflow-hidden rounded-lg border border-neutral-200/60">
          <div className="flex-1 bg-white/90 p-1.5">
            <Bar className="w-5 bg-neutral-300" />
            <Bar className="mt-1 w-8 bg-neutral-200" />
          </div>
          <div className="flex-1 bg-neutral-800 p-1.5">
            <Bar className="w-5 bg-neutral-500" />
            <Bar className="mt-1 w-8 bg-neutral-600" />
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: QuoteIcon,
    featured: true,
    title: 'Bumalik na ang testimonials',
    description:
      'Magsusulat ang friends sa profile mo tulad ng dati — walang lalabas hangga’t hindi mo ina-approve.',
    preview: (
      <div className="flex flex-col gap-1.5">
        <div className="rounded-lg border border-neutral-200/60 bg-white/70 p-2">
          <QuoteIcon className="h-2.5 w-2.5 text-accent-400" />
          <div className="mt-1 flex flex-col gap-1">
            <Bar className="w-full bg-neutral-200" />
            <Bar className="w-3/4 bg-neutral-200" />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Disc className="h-3 w-3 bg-gradient-to-br from-accent-400 to-accent-500" />
            <Bar className="w-10 bg-neutral-300" />
          </div>
        </div>
        {/* Pending testimonial — waits on the recipient's approval */}
        <div className="flex items-center justify-between rounded-lg border border-dashed border-neutral-300/70 bg-white/50 px-2 py-1.5">
          <Bar className="w-16 bg-neutral-200" />
          <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-accent-600">
            Approve
          </span>
        </div>
      </div>
    ),
  },
]

// The manifesto, split into the "before" and "after" columns.
const LEFT_BEHIND = [
  'Algorithmic feeds na nagdedecide kung ano ang makikita mo',
  'Metrics na ginagawang audience ang mga kaibigan mo',
  'Persona na kailangan mong i-build at i-perform',
  'Ads at trackers sa pagitan ng bawat post',
]

const YOU_GET = [
  'Chronological feed ng mga taong fina-follow mo talaga',
  'Totoong mail at totoong conversations, hindi engagement bait',
  'Profile na sa’yo — public lang kung gusto mo',
  'Testimonials mula sa tropa — lalabas lang kapag in-approve mo',
  'Privacy controls sa bawat post at message',
]

const STEPS: { title: string; description: string }[] = [
  {
    title: 'Gumawa ng account',
    description: 'Pumili ng name at handle — isang minuto lang, kasama ka na.',
  },
  {
    title: 'Gawing sa’yo',
    description: 'Lagyan ng avatar, cover photo, at bio. Mag-set na rin ng theme habang andyan ka.',
  },
  {
    title: 'Tambay na',
    description: 'Mag-post, i-follow ang tropa, at hayaang dumaan ang mga kwento.',
  },
]

function FeatureCard({ icon: Icon, title, description, preview, featured }: Feature) {
  return (
    <div
      className={`glass group relative overflow-hidden rounded-3xl p-5 transition-all duration-200 hover:-translate-y-1 hover:border-accent-300/60 hover:shadow-xl hover:shadow-accent-600/10 ${
        featured ? 'sm:col-span-2' : ''
      }`}
    >
      {/* Soft glow that fades in behind the tile on hover */}
      <span
        className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent-400/0 blur-2xl transition-colors duration-300 group-hover:bg-accent-400/20"
        aria-hidden="true"
      />
      <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-600 ring-1 ring-inset ring-accent-500/15 transition-all duration-200 group-hover:bg-gradient-to-br group-hover:from-accent-500 group-hover:to-accent-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-accent-600/30 group-hover:ring-accent-500">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="relative mt-3 text-sm font-semibold text-neutral-800">{title}</h3>
      <p className="relative mt-1 text-sm leading-relaxed text-neutral-500">{description}</p>
      <div
        className={`relative mt-3 overflow-hidden rounded-xl border border-neutral-200/60 bg-white/50 p-2.5 ${
          featured ? 'h-36' : 'h-28'
        }`}
        aria-hidden="true"
      >
        {preview}
      </div>
    </div>
  )
}

// Floating notification-style chip for the hero preview. --float-rotate keeps a
// slight tilt while the float keyframes move it up and down.
function FloatChip({
  className,
  rotate,
  delay,
  children,
}: {
  className: string
  rotate: string
  delay: string
  children: React.ReactNode
}) {
  return (
    <span
      className={`glass-pop absolute items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium text-neutral-600 shadow-lg motion-safe:animate-float ${className}`}
      style={{ '--float-rotate': rotate, animationDelay: delay } as React.CSSProperties}
    >
      {children}
    </span>
  )
}

export default async function LandingPage() {
  const user = await getCurrentUser()
  if (user) redirect('/home')

  const settings = await getSiteSettings()

  return (
    <main className="animate-page-in">
      {/* Hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-12 text-center sm:pt-20">
        <BrandMark size="lg" />
        <p className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3.5 py-1.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-500/20">
          {settings.appName} — {settings.heroTagline}
        </p>
        <h1 className="mt-5 max-w-2xl text-balance bg-gradient-to-br from-accent-700 via-accent-600 to-accent-600 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
          Ang social media na dapat,{' '}
          <span className="relative whitespace-nowrap">
            bumalik na
            <svg
              className="absolute -bottom-1 left-0 w-full text-accent-500/70"
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
          !
        </h1>
        <p className="mt-4 max-w-xl text-balance text-lg leading-relaxed text-neutral-600">
          Walang algorithms. Walang persona. Ikaw at ang{' '}
          <span className="font-semibold text-accent-700">kwento</span> mo lang.
        </p>
        <p className="mt-2 text-xs italic text-neutral-400">
          kwento — Tagalog for &ldquo;story&rdquo;
        </p>

        <div className="mt-7 w-full">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-accent-600">
            Hanapin ang tropa mo
          </p>
          <LandingUserSearch />
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="btn-primary group flex items-center gap-1.5 rounded-full px-7 py-3.5 text-sm"
          >
            Gumawa ka na ng account
            <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/login"
            className="glass rounded-full px-7 py-3.5 text-sm font-semibold text-neutral-700 transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            May account na ako
          </Link>
        </div>
        <p className="mt-3 text-xs text-neutral-400">Isang minuto lang, promise.</p>

        {/* Decorative feed preview — suggests the timeline without a screenshot,
            with floating notification chips for a sense of life */}
        <div className="relative mt-20 w-full max-w-md" aria-hidden="true">
          <div className="glass absolute inset-x-8 -bottom-2.5 top-8 rotate-2 rounded-3xl opacity-60" />
          <div className="glass absolute inset-x-4 -bottom-1 top-4 -rotate-1 rounded-3xl opacity-80" />

          <FloatChip className="-top-6 right-3 flex" rotate="2deg" delay="0.4s">
            <HeartIcon filled className="h-3.5 w-3.5 text-accent-500" />
            Nag-like si Maria ng kwento mo
          </FloatChip>
          <FloatChip className="-left-7 top-1/3 hidden sm:flex" rotate="-2deg" delay="1.4s">
            <UsersIcon className="h-3.5 w-3.5 text-accent-600" />
            Nag-follow si @jose sa&apos;yo
          </FloatChip>
          <FloatChip className="-bottom-8 right-5 hidden sm:flex" rotate="1.5deg" delay="2.3s">
            <MailIcon className="h-3.5 w-3.5 text-accent-600" />
            May mail ka kay Ate Kim
          </FloatChip>
          <FloatChip className="-bottom-10 left-3 hidden sm:flex" rotate="-1.5deg" delay="3.1s">
            <QuoteIcon className="h-3.5 w-3.5 text-accent-600" />
            May testimonial ka kay Ana
          </FloatChip>

          <article className="glass relative rounded-3xl p-5 text-left">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 text-sm font-bold text-white">
                J
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight text-neutral-800">
                  Juan Dela Cruz
                </span>
                <span className="block truncate text-xs leading-tight text-neutral-500">
                  @juandelacruz · 2h
                </span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-700">
              Walang algorithm dito, walang arte — kwento lang. Parang internet dati. Tambay tayo!
            </p>
            <div className="mt-3 flex h-28 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400/50 via-accent-300/40 to-accent-300/40 text-accent-700/50">
              <ImageIcon className="h-6 w-6" />
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs font-medium text-neutral-500">
              <span className="flex items-center gap-1.5 text-accent-600">
                <HeartIcon filled className="h-4 w-4" /> 24
              </span>
              <span className="flex items-center gap-1.5">
                <CommentIcon className="h-4 w-4" /> 6
              </span>
              <span className="flex items-center gap-1.5">
                <BookmarkIcon className="h-4 w-4" /> 3
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* The promise — what we left behind vs. what you get */}
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:pb-20">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            Ang promise
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Tapos na ang feed fatigue. Balik sa kwento.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-500">
            Kinuha namin ang maganda sa social media at tinanggal ang nakakapagod.
          </p>
        </div>

        <div className="relative mt-8 grid gap-3 md:grid-cols-2">
          <div className="glass rounded-3xl p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-500/10 text-neutral-400">
                <XIcon className="h-4 w-4" />
              </span>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                Ang mga iniwan natin
              </h3>
            </div>
            <ul className="mt-3 divide-y divide-black/5">
              {LEFT_BEHIND.map((item) => (
                <li key={item} className="flex items-start gap-3 py-2.5 text-sm text-neutral-500">
                  <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="glass rounded-3xl p-5 ring-2 ring-accent-500/25 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-500/15 text-accent-600">
                <SparklesIcon className="h-4 w-4" />
              </span>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-accent-600">
                Ang makukuha mo sa {settings.appName}
              </h3>
            </div>
            <ul className="mt-3 divide-y divide-black/5">
              {YOU_GET.map((item) => (
                <li key={item} className="flex items-start gap-3 py-2.5 text-sm text-neutral-700">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* "VS" badge straddling the two columns on desktop */}
          <span
            className="absolute left-1/2 top-1/2 z-10 hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-bold text-white shadow-lg md:flex dark:bg-white dark:text-neutral-900"
            aria-hidden="true"
          >
            VS
          </span>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:pb-20">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            Nasa isang lugar na lahat
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Sarili mong corner ng internet
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-500">
            Kinuha ng {settings.appName} ang mga magagandang parts ng social media — posting,
            following, messaging — at tinapon na ang iba.
          </p>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
        <p className="mt-8 text-center text-sm">
          <Link
            href="/register"
            className="inline-flex items-center gap-1 font-semibold text-accent-700 hover:underline"
          >
            Gumawa ka na ng account para makita mo lahat
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        </p>
      </section>

      {/* Handle claim — the @handle is the visitor's stake in the community */}
      <section className="mx-auto max-w-3xl px-4 pb-16 sm:pb-20">
        <div className="glass rounded-[2rem] px-6 py-10 text-center sm:px-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            Claim mo na ang handle mo
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Ang corner mo sa internet, nagsisimula sa @
          </h2>

          {/* Decorative handle pill — looks like the visitor is mid-signup */}
          <div
            className="mx-auto mt-5 flex w-fit items-center gap-1.5 rounded-full border border-neutral-200/60 bg-white/70 py-2.5 pl-5 pr-2.5 text-sm shadow-sm backdrop-blur-sm"
            aria-hidden="true"
          >
            <span className="font-semibold text-neutral-400">@</span>
            <span className="font-semibold text-neutral-800">yourname</span>
            <span className="h-5 w-0.5 animate-pulse bg-accent-500" />
            <span className="ml-1.5 flex items-center gap-1 rounded-full bg-accent-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-600">
              <CheckIcon className="h-3 w-3" />
              Pwede
            </span>
          </div>

          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-neutral-500">
            Ang @handle mo ay shareable profile page na rin — public kung gusto mo. Kuhanin mo na
            ang maganda bago ka maunahan.
          </p>
          <Link
            href="/register"
            className="btn-primary mt-6 inline-block rounded-full px-7 py-3 text-sm"
          >
            Claim mo na
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:pb-20">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            Mabilisang simula lang
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Tatlong steps, tapos ka na
          </h2>
        </div>
        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="glass overflow-hidden rounded-3xl">
              {/* Progress strip — fills a third further on each step */}
              <div className="h-1 bg-accent-500/10" aria-hidden="true">
                <div
                  className="h-full bg-gradient-to-r from-accent-400 to-accent-500"
                  style={{ width: `${((i + 1) / STEPS.length) * 100}%` }}
                />
              </div>
              <div className="p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-sm font-bold text-white shadow-md shadow-accent-600/30 ring-4 ring-accent-500/15">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-neutral-800">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA — solid gradient card so the ask stands out from the glass */}
      <section className="mx-auto max-w-3xl px-4 pb-20">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-accent-600 via-accent-500 to-accent-600 px-6 py-12 text-center shadow-xl shadow-accent-600/30 sm:px-12">
          <div
            className="absolute -top-28 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-white/20 blur-3xl"
            aria-hidden="true"
          />
          <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Tara, tambay na.
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-accent-50/90">
            Walang algorithms. Walang persona. Ikaw at ang kwento mo lang — claim mo na ang handle
            mo sa {settings.appName} ngayon.
          </p>
          <Link
            href="/register"
            className="relative mt-7 inline-flex items-center gap-1.5 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-accent-700 shadow-lg transition-all hover:scale-[1.03] hover:shadow-xl active:scale-[0.98]"
          >
            Gumawa ka na — libre lang
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
          <p className="relative mt-5 text-xs text-accent-100/80">
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
    </main>
  )
}

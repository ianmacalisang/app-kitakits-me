import type { Metadata } from 'next'
import Link from 'next/link'

import { GoBackButton } from '@/components/GoBackButton'
import { CompassIcon, HomeIcon, MailboxIcon } from '@/components/icons'

export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <div className="glass relative flex flex-col items-center overflow-hidden rounded-3xl px-6 py-12 text-center">
      {/* Same 4—0—4 motif as the public 404, sized down for the feed column */}
      <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
        <span className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 bg-clip-text text-6xl font-bold leading-none text-transparent sm:text-7xl">
          4
        </span>
        <span className="h-12 w-12 rounded-full border-4 border-dashed border-emerald-400/70 motion-safe:animate-float sm:h-14 sm:w-14" />
        <span className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 bg-clip-text text-6xl font-bold leading-none text-transparent sm:text-7xl">
          4
        </span>
      </div>
      <p className="sr-only">Error 404</p>

      <h1 className="mt-5 text-xl font-bold tracking-tight text-neutral-800 sm:text-2xl">
        Walang tambayan dito.
      </h1>
      <p className="mt-2 max-w-sm text-balance text-sm leading-relaxed text-neutral-500">
        This page may have been deleted, made private, or the link is just off.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
        <Link
          href="/home"
          className="btn-primary flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm"
        >
          <HomeIcon className="h-4 w-4" />
          Back to feed
        </Link>
        <GoBackButton
          fallback="/home"
          className="glass rounded-full px-6 py-2.5 text-sm font-semibold text-neutral-700 transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Go back
        </GoBackButton>
      </div>

      <div className="mt-6 flex items-center justify-center gap-1.5 text-xs font-medium">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-neutral-600 transition-colors hover:bg-emerald-500/15 hover:text-emerald-600"
        >
          <CompassIcon className="h-3.5 w-3.5" />
          Explore
        </Link>
        <Link
          href="/mailbox"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-neutral-600 transition-colors hover:bg-emerald-500/15 hover:text-emerald-600"
        >
          <MailboxIcon className="h-3.5 w-3.5" />
          Mailbox
        </Link>
      </div>
    </div>
  )
}

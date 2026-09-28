'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { GoBackButton } from '@/components/GoBackButton'
import { CompassIcon, HomeIcon } from '@/components/icons'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="glass relative flex flex-col items-center overflow-hidden rounded-3xl px-6 py-12 text-center">
      {/* Same 5—0—0 motif as the public error page, sized down for the feed column */}
      <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
        <span className="bg-gradient-to-br from-accent-600 via-accent-500 to-accent-500 bg-clip-text text-6xl font-bold leading-none text-transparent sm:text-7xl">
          5
        </span>
        <span className="h-12 w-12 rounded-full border-4 border-dashed border-accent-400/70 motion-safe:animate-float sm:h-14 sm:w-14" />
        <span className="bg-gradient-to-br from-accent-600 via-accent-500 to-accent-500 bg-clip-text text-6xl font-bold leading-none text-transparent sm:text-7xl">
          0
        </span>
      </div>
      <p className="sr-only">Error 500</p>

      <h1 className="mt-5 text-xl font-bold tracking-tight text-neutral-800 sm:text-2xl">
        May aberya sa tambayan.
      </h1>
      <p className="mt-2 max-w-sm text-balance text-sm leading-relaxed text-neutral-500">
        Something broke on our end. Try again — if it keeps happening, come back in a bit.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="btn-primary flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm"
        >
          Try again
        </button>
        <GoBackButton
          fallback="/home"
          className="glass rounded-full px-6 py-2.5 text-sm font-semibold text-neutral-700 transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Go back
        </GoBackButton>
      </div>

      <div className="mt-6 flex items-center justify-center gap-1.5 text-xs font-medium">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-neutral-600 transition-colors hover:bg-accent-500/15 hover:text-accent-600"
        >
          <HomeIcon className="h-3.5 w-3.5" />
          Home
        </Link>
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-neutral-600 transition-colors hover:bg-accent-500/15 hover:text-accent-600"
        >
          <CompassIcon className="h-3.5 w-3.5" />
          Explore
        </Link>
      </div>
    </div>
  )
}

'use client'

import { useEffect } from 'react'

import { GoBackButton } from '@/components/GoBackButton'

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
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="animate-page-in flex w-full max-w-md flex-col items-center text-center">
        {/* 5—0—0: same drifting hollow-ring motif as the 404 */}
        <div className="mt-10 flex items-center justify-center gap-2 sm:gap-3" aria-hidden="true">
          <span className="bg-gradient-to-br from-accent-600 via-accent-500 to-accent-500 bg-clip-text text-8xl font-bold leading-none text-transparent sm:text-9xl">
            5
          </span>
          <span className="h-[4.5rem] w-[4.5rem] rounded-full border-[5px] border-dashed border-accent-400/70 motion-safe:animate-float sm:h-24 sm:w-24" />
          <span className="bg-gradient-to-br from-accent-600 via-accent-500 to-accent-500 bg-clip-text text-8xl font-bold leading-none text-transparent sm:text-9xl">
            0
          </span>
        </div>
        <p className="sr-only">Error 500</p>

        <h1 className="mt-8 text-2xl font-bold tracking-tight text-neutral-800 sm:text-3xl">
          May aberya sa tambayan.
        </h1>
        <p className="mt-1.5 text-xs italic text-neutral-400">
          aberya — Tagalog for &ldquo;glitch&rdquo;
        </p>
        <p className="mt-3 max-w-sm text-balance text-sm leading-relaxed text-neutral-500">
          Something broke on our end. Try again — if it keeps happening, come back in a bit.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="btn-primary flex items-center gap-1.5 rounded-full px-6 py-3 text-sm"
          >
            Try again
          </button>
          <GoBackButton
            fallback="/"
            className="glass rounded-full px-6 py-3 text-sm font-semibold text-neutral-700 transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Go back
          </GoBackButton>
        </div>
      </div>
    </main>
  )
}

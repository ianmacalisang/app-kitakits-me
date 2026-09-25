import type { Metadata } from 'next'
import Link from 'next/link'

import { GoBackButton } from '@/components/GoBackButton'
import { HomeIcon } from '@/components/icons'
import { getCurrentUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Page not found' }

export default async function NotFound() {
  const user = await getCurrentUser()

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="animate-page-in flex w-full max-w-md flex-col items-center text-center">
        {/* 4—0—4: the missing page is the hollow ring that drifted off */}
        <div className="mt-10 flex items-center justify-center gap-2 sm:gap-3" aria-hidden="true">
          <span className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 bg-clip-text text-8xl font-bold leading-none text-transparent sm:text-9xl">
            4
          </span>
          <span className="h-[4.5rem] w-[4.5rem] rounded-full border-[5px] border-dashed border-emerald-400/70 motion-safe:animate-float sm:h-24 sm:w-24" />
          <span className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 bg-clip-text text-8xl font-bold leading-none text-transparent sm:text-9xl">
            4
          </span>
        </div>
        <p className="sr-only">Error 404</p>

        <h1 className="mt-8 text-2xl font-bold tracking-tight text-neutral-800 sm:text-3xl">
          Walang tambayan dito.
        </h1>
        <p className="mt-1.5 text-xs italic text-neutral-400">
          tambayan — Tagalog for &ldquo;hangout spot&rdquo;
        </p>
        <p className="mt-3 max-w-sm text-balance text-sm leading-relaxed text-neutral-500">
          The page you&apos;re looking for moved, went private, or was never here in the first
          place.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={user ? '/home' : '/'}
            className="btn-primary flex items-center gap-1.5 rounded-full px-6 py-3 text-sm"
          >
            <HomeIcon className="h-4 w-4" />
            Back to the tambayan
          </Link>
          <GoBackButton
            fallback={user ? '/home' : '/'}
            className="glass rounded-full px-6 py-3 text-sm font-semibold text-neutral-700 transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Go back
          </GoBackButton>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-neutral-400">
          Looking for someone&apos;s profile? Public pages live at{' '}
          <span className="font-medium text-emerald-700/80">/@username</span>.
        </p>
      </div>
    </main>
  )
}

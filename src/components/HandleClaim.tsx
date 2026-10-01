'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { checkUsername } from '@/actions/auth'

import { CheckIcon, ChevronRightIcon, XIcon } from './icons'
import { Spinner } from './Spinner'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/

type Status = 'idle' | 'invalid' | 'checking' | 'available' | 'taken'

// Live @handle claim box on the landing page — same debounced availability
// check as the register form (checkUsername is already rate-limited). A
// valid handle rides into /register?username= so it lands prefilled.
export function HandleClaim() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState<{ username: string; available: boolean } | null>(null)

  const trimmed = value.trim()

  useEffect(() => {
    if (!USERNAME_PATTERN.test(trimmed)) return
    const timer = setTimeout(() => {
      void checkUsername(trimmed)
        .then((available) => setChecked({ username: trimmed, available }))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
  }, [trimmed])

  const status: Status = !trimmed
    ? 'idle'
    : !USERNAME_PATTERN.test(trimmed)
      ? 'invalid'
      : checked?.username === trimmed
        ? checked.available
            ? 'available'
            : 'taken'
        : 'checking'

  const hint = {
    idle: '3–30 characters — letters, numbers, and underscores.',
    invalid: 'Letters, numbers, and underscores lang.',
    checking: 'Checking…',
    available: `@${trimmed} is available — kuhanin mo na!`,
    taken: `@${trimmed} is taken — try another.`,
  }[status]

  const hintClass =
    status === 'available'
      ? 'text-accent-600'
      : status === 'taken' || status === 'invalid'
        ? 'text-red-600'
        : 'text-neutral-400'

  const claimHref = USERNAME_PATTERN.test(trimmed)
    ? `/register?username=${encodeURIComponent(trimmed)}`
    : '/register'

  const claim = () => router.push(claimHref)

  return (
    <div className="mx-auto mt-5 w-full max-w-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          claim()
        }}
      >
        <div
          className={`flex items-center gap-1.5 rounded-full border bg-white/70 py-2.5 pl-5 pr-2.5 shadow-sm backdrop-blur-sm transition-colors ${
            status === 'taken' || status === 'invalid'
              ? 'border-red-300/70'
              : 'border-neutral-200/60 focus-within:border-accent-400/60'
          }`}
        >
          <span className="font-semibold text-neutral-400">@</span>
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setChecked(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                claim()
              }
            }}
            placeholder="yourname"
            aria-label="Choose your handle"
            aria-invalid={status === 'taken' || status === 'invalid'}
            aria-describedby="handle-claim-hint"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            className="min-w-0 flex-1 bg-transparent font-semibold text-neutral-800 outline-none placeholder:font-normal placeholder:text-neutral-400"
          />
          {status === 'checking' && <Spinner className="h-4 w-4 shrink-0 text-neutral-400" />}
          {status === 'available' && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-600">
              <CheckIcon className="h-3 w-3" />
              Pwede
            </span>
          )}
          {status === 'taken' && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-600">
              <XIcon className="h-3 w-3" />
              Taken
            </span>
          )}
        </div>
        <p id="handle-claim-hint" className={`mt-2 text-center text-xs ${hintClass}`}>
          {hint}
        </p>
      </form>

      <Link
        href={claimHref}
        className="btn-primary mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-full px-7 py-3 text-sm"
      >
        {status === 'available' ? `Claim si @${trimmed}` : 'Claim mo na'}
        <ChevronRightIcon className="h-4 w-4" />
      </Link>
    </div>
  )
}

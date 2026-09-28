'use client'

import Link from 'next/link'
import { type FormEvent, useActionState, useEffect, useState } from 'react'

import { requestConnectLink } from '@/actions/connect'

import { MailIcon } from './icons'
import { Spinner } from './Spinner'

const RESEND_COOLDOWN = 60

// Sent state — remounted via `key` on every send so the cooldown restarts.
function SentView({
  ownerUsername,
  identifier,
  pending,
  formAction,
  onEdit,
  captureIdentifier,
}: {
  ownerUsername: string
  identifier: string
  pending: boolean
  formAction: (payload: FormData) => void
  onEdit: () => void
  captureIdentifier: (e: FormEvent<HTMLFormElement>) => void
}) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)

  useEffect(() => {
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="mt-5 flex flex-col items-center gap-3 text-center">
      <span className="btn-accent-soft flex h-12 w-12 items-center justify-center rounded-full">
        <MailIcon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-neutral-800">Check your inbox</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">
          If there&apos;s an account for <strong>{identifier}</strong>, a connect link is on its way
          to its registered email. It expires in 30 minutes.
        </p>
      </div>
      <form action={formAction} onSubmit={captureIdentifier}>
        <input type="hidden" name="owner" value={ownerUsername} />
        <input type="hidden" name="identifier" value={identifier} />
        <button
          type="submit"
          disabled={pending || cooldown > 0}
          className="btn-primary flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm disabled:opacity-60"
        >
          {pending && <Spinner className="h-4 w-4 text-white" />}
          {pending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
        </button>
      </form>
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-neutral-400 transition-colors hover:text-neutral-600"
      >
        Use a different account
      </button>
    </div>
  )
}

// The logged-out path on /connect/<username> — the scanner identifies their
// account by email/username and we email a one-time link to its registered
// address. Responses are uniform so account existence isn't revealed.
export function ConnectInvite({
  ownerUsername,
  appName,
  registerHref,
  loginHref,
}: {
  ownerUsername: string
  appName: string
  registerHref: string
  loginHref: string
}) {
  const [state, formAction, pending] = useActionState(requestConnectLink, {})
  const [sentIdentifier, setSentIdentifier] = useState('')
  const [sends, setSends] = useState(0)
  const [editMode, setEditMode] = useState(false)

  const captureIdentifier = (e: FormEvent<HTMLFormElement>) => {
    const fd = new FormData(e.currentTarget)
    setSentIdentifier(String(fd.get('identifier') ?? '').trim())
    setSends((s) => s + 1)
    setEditMode(false)
  }

  if (state.sent && !editMode) {
    return (
      <SentView
        key={sends}
        ownerUsername={ownerUsername}
        identifier={sentIdentifier}
        pending={pending}
        formAction={formAction}
        onEdit={() => setEditMode(true)}
        captureIdentifier={captureIdentifier}
      />
    )
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      <form action={formAction} onSubmit={captureIdentifier} className="flex flex-col gap-3">
        <input type="hidden" name="owner" value={ownerUsername} />
        <input
          name="identifier"
          type="text"
          required
          autoFocus
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Your email or @username"
          aria-label="Your email or username"
          className="glass-input"
        />
        {state.error && (
          <p
            role="alert"
            className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600"
          >
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-primary flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm"
        >
          {pending && <Spinner className="h-4 w-4 text-white" />}
          {pending ? 'Sending…' : 'Send me a connect link'}
        </button>
        <p className="text-center text-[11px] leading-relaxed text-neutral-400">
          No password needed — we&apos;ll email you a one-tap link.
        </p>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-black/10" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          New to {appName}?
        </span>
        <span className="h-px flex-1 bg-black/10" />
      </div>
      <Link
        href={registerHref}
        className="rounded-xl bg-black/5 py-2.5 text-center text-sm font-semibold text-neutral-700 transition-colors hover:bg-black/10"
      >
        Create an account
      </Link>
      <p className="text-center text-xs text-neutral-400">
        or{' '}
        <Link href={loginHref} className="font-medium text-accent-700 hover:underline">
          log in
        </Link>
      </p>
    </div>
  )
}

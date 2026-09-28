'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { confirmConnect } from '@/actions/connect'

import { Avatar } from './Avatar'
import { CheckIcon } from './icons'
import { Spinner } from './Spinner'

// The emailed connect link lands here — one explicit tap completes the mutual
// follow (a tap, not the GET, so mail-scanner prefetch can't trigger it).
export function ConnectConfirm({
  token,
  scannerName,
  scannerUsername,
  scannerAvatarUrl,
  ownerName,
  ownerUsername,
  ownerAvatarUrl,
  loggedIn,
  loggedInAs,
}: {
  token: string
  scannerName: string
  scannerUsername: string
  scannerAvatarUrl?: string
  ownerName: string
  ownerUsername: string
  ownerAvatarUrl?: string
  loggedIn: boolean
  loggedInAs?: string
}) {
  const [state, formAction, pending] = useActionState(confirmConnect, {})

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="btn-accent-soft flex h-12 w-12 items-center justify-center rounded-full">
          <CheckIcon className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold text-neutral-800">
            {scannerName} and {ownerName} are now connected
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            You&apos;ll see each other&apos;s posts in your feeds.
          </p>
        </div>
        <div className="mt-1 flex w-full flex-col gap-2">
          {loggedIn ? (
            <>
              <Link
                href={`/mailbox?to=${ownerUsername}`}
                className="btn-primary rounded-xl py-2.5 text-sm"
              >
                Send {ownerName.split(' ')[0] || ownerName} a mail
              </Link>
              <Link href="/home" className="py-1.5 text-sm text-neutral-500 hover:text-neutral-800">
                Go home
              </Link>
            </>
          ) : (
            <Link href="/login" className="btn-primary rounded-xl py-2.5 text-sm">
              Log in to say hi
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex items-center justify-center -space-x-4">
        <Avatar src={scannerAvatarUrl} name={scannerName} size="lg" />
        <Avatar src={ownerAvatarUrl} name={ownerName} size="lg" />
      </div>
      <div>
        <p className="text-sm font-semibold text-neutral-800">Connect with {ownerName}?</p>
        <p className="mt-1 text-xs text-neutral-500">
          As <strong>@{scannerUsername}</strong> — you&apos;ll follow each other instantly.
        </p>
        {loggedInAs && loggedInAs !== scannerUsername && (
          <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
            You&apos;re logged in as @{loggedInAs} — this link connects @{scannerUsername}, not
            your current account.
          </p>
        )}
      </div>
      <form action={formAction} className="w-full">
        <input type="hidden" name="token" value={token} />
        {state.error && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600"
          >
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm"
        >
          {pending && <Spinner className="h-4 w-4 text-white" />}
          {pending ? 'Connecting…' : `Yes, connect us`}
        </button>
      </form>
    </div>
  )
}

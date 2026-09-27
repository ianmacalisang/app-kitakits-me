'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'

import { updateProfileDesign } from '@/actions/users'
import type { ProfileAccent, ProfileCardStyle, ProfileLayout } from '@/lib/profileDesign'

import { ArrowUpRightIcon, CheckIcon } from './icons'
import { ProfileDesignControls } from './ProfileDesignControls'
import { ProfileDesignPreview } from './ProfileDesignPreview'

const submitClass =
  'btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm'

export interface DesignPreviewData {
  name: string
  username: string
  bio: string | null
  website: string | null
  avatarUrl?: string
  coverUrl?: string
  joinedLabel: string
  followers: number
  following: number
}

// Design editor for the public /@username page — a live preview on top, then
// the pickers. The whole form sits under data-profile-accent so the pickers'
// accent styling (selection rings, submit button) previews the palette too.
export function ProfileDesignForm({
  publicProfile,
  initial,
  preview,
}: {
  publicProfile: boolean
  initial: {
    layout: ProfileLayout
    accent: ProfileAccent
    cardStyle: ProfileCardStyle
    backgroundUrl?: string
  }
  preview: DesignPreviewData
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateProfileDesign, {})
  const [layout, setLayout] = useState<ProfileLayout>(initial.layout)
  const [accent, setAccent] = useState<ProfileAccent>(initial.accent)
  const [cardStyle, setCardStyle] = useState<ProfileCardStyle>(initial.cardStyle)
  // undefined = untouched (use initial.backgroundUrl); null = removed;
  // string = pending upload preview.
  const [background, setBackground] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state, router])

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5"
      data-profile-accent={accent === 'default' ? undefined : accent}
    >
      <ProfileDesignPreview
        layout={layout}
        accent={accent}
        cardStyle={cardStyle}
        backgroundUrl={background === undefined ? initial.backgroundUrl : background}
        {...preview}
      />

      <ProfileDesignControls
        layout={layout}
        accent={accent}
        cardStyle={cardStyle}
        backgroundUrl={initial.backgroundUrl}
        onLayoutChange={setLayout}
        onAccentChange={setAccent}
        onCardStyleChange={setCardStyle}
        onBackgroundChange={setBackground}
      />

      {!publicProfile && (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Your public profile is off — visitors can&apos;t see this page yet. Enable it in Settings
          → Account &amp; privacy.
        </p>
      )}

      {state.error && (
        <p className="animate-fade-in rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <div className="animate-fade-in flex items-center gap-3 rounded-2xl border border-accent-500/25 bg-accent-500/10 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white shadow-sm shadow-accent-900/20">
            <CheckIcon className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm font-medium text-accent-700 dark:text-accent-300">
            Design saved — your public page is updated.
          </p>
          <Link
            href={`/@${preview.username}`}
            target="_blank"
            className="btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs"
          >
            Check your profile
            <ArrowUpRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? 'Saving…' : 'Save design'}
      </button>
    </form>
  )
}

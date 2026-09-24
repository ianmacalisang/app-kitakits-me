'use client'

import { useState, useTransition } from 'react'

import { toggleSave } from '@/actions/saves'
import { POST_SAVE_TOGGLED, type PostSaveToggledDetail } from '@/lib/events'

import { AuthPrompt } from './AuthPrompt'
import { BookmarkIcon } from './icons'

export function SaveButton({
  postId,
  initialSaved,
  authenticated = true,
}: {
  postId: number
  initialSaved: boolean
  authenticated?: boolean
}) {
  const [saved, setSaved] = useState(initialSaved)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleClick = () => {
    if (!authenticated) {
      setAuthPromptOpen(true)
      return
    }
    // Optimistic update, then reconcile with the server result.
    setSaved(!saved)
    startTransition(async () => {
      const result = await toggleSave(postId)
      setSaved(result.saved)
      // Let the Saved tab (if mounted) add/remove the card.
      window.dispatchEvent(
        new CustomEvent<PostSaveToggledDetail>(POST_SAVE_TOGGLED, {
          detail: { postId, saved: result.saved },
        }),
      )
    })
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        className={`flex items-center text-sm transition-colors ${
          saved ? 'text-emerald-600' : 'text-neutral-500 hover:text-emerald-600'
        }`}
        aria-label={saved ? 'Remove from saved' : 'Save post'}
        aria-pressed={saved}
      >
        <BookmarkIcon className="h-5 w-5" filled={saved} />
      </button>
      <AuthPrompt open={authPromptOpen} onCloseAction={() => setAuthPromptOpen(false)} />
    </>
  )
}

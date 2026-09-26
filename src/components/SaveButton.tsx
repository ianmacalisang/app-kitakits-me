'use client'

import { useState, useTransition } from 'react'

import { toggleSave } from '@/actions/saves'
import { POST_SAVE_TOGGLED, type PostSaveToggledDetail } from '@/lib/events'

import { AuthPrompt } from './AuthPrompt'
import { BookmarkIcon } from './icons'

export function SaveButton({
  postId,
  initialSaved,
  initialCount,
  authenticated = true,
  onDark = false,
}: {
  postId: number
  initialSaved: boolean
  initialCount: number
  authenticated?: boolean
  // Renders legibly over dark media (reels overlay rail).
  onDark?: boolean
}) {
  const [saved, setSaved] = useState(initialSaved)
  const [count, setCount] = useState(initialCount)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleClick = () => {
    if (!authenticated) {
      setAuthPromptOpen(true)
      return
    }
    // Optimistic update, then reconcile with the server result.
    setSaved(!saved)
    setCount(count + (saved ? -1 : 1))
    startTransition(async () => {
      const result = await toggleSave(postId)
      setSaved(result.saved)
      setCount(result.count)
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
        className={`flex items-center gap-1.5 text-sm transition-colors ${
          saved
            ? onDark
              ? 'text-accent-400'
              : 'text-accent-600'
            : onDark
              ? 'text-white/85 hover:text-accent-300'
              : 'text-neutral-500 hover:text-accent-600'
        }`}
        aria-label={saved ? 'Remove from saved' : 'Save post'}
        aria-pressed={saved}
      >
        <BookmarkIcon className="h-5 w-5" filled={saved} />
        {count > 0 && <span>{count}</span>}
      </button>
      <AuthPrompt open={authPromptOpen} onCloseAction={() => setAuthPromptOpen(false)} />
    </>
  )
}

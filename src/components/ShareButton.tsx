'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { sharePost } from '@/actions/posts'

import { AuthPrompt } from './AuthPrompt'
import { ShareIcon } from './icons'

export function ShareButton({
  postId,
  initialShared,
  initialCount,
  authenticated = true,
}: {
  postId: number
  initialShared: boolean
  initialCount: number
  authenticated?: boolean
}) {
  const router = useRouter()
  const [shared, setShared] = useState(initialShared)
  const [count, setCount] = useState(initialCount)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleClick = () => {
    if (!authenticated) {
      setAuthPromptOpen(true)
      return
    }
    // Optimistic update, then reconcile with the server result.
    setShared(!shared)
    setCount(count + (shared ? -1 : 1))
    startTransition(async () => {
      const result = await sharePost(postId)
      if (result.error) {
        setShared(shared)
        setCount(count)
        return
      }
      setShared(Boolean(result.shared))
      setCount(result.count ?? 0)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        className={`flex items-center gap-1.5 text-sm transition-colors ${
          shared ? 'text-emerald-500' : 'text-neutral-500 hover:text-emerald-500'
        }`}
        aria-label={shared ? 'Undo repost' : 'Repost'}
        aria-pressed={shared}
      >
        <ShareIcon className="h-5 w-5" />
        <span>{count}</span>
      </button>
      <AuthPrompt open={authPromptOpen} onCloseAction={() => setAuthPromptOpen(false)} />
    </>
  )
}

'use client'

import { useState, useTransition } from 'react'

import { toggleLike } from '@/actions/likes'

import { AuthPrompt } from './AuthPrompt'
import { HeartIcon } from './icons'

export function LikeButton({
  postId,
  initialLiked,
  initialCount,
  authenticated = true,
}: {
  postId: number
  initialLiked: boolean
  initialCount: number
  authenticated?: boolean
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleClick = () => {
    if (!authenticated) {
      setAuthPromptOpen(true)
      return
    }
    // Optimistic update, then reconcile with the server result.
    setLiked(!liked)
    setCount(count + (liked ? -1 : 1))
    startTransition(async () => {
      const result = await toggleLike(postId)
      setLiked(result.liked)
      setCount(result.count)
    })
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        className={`flex items-center gap-1.5 text-sm transition-colors ${
          liked ? 'text-rose-500' : 'text-neutral-500 hover:text-rose-500'
        }`}
        aria-label={liked ? 'Unlike' : 'Like'}
        aria-pressed={liked}
      >
        <HeartIcon className="h-5 w-5" filled={liked} />
        <span>{count}</span>
      </button>
      <AuthPrompt open={authPromptOpen} onCloseAction={() => setAuthPromptOpen(false)} />
    </>
  )
}

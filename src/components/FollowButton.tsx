'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { toggleFollow } from '@/actions/follows'

export function FollowButton({
  targetUserId,
  initialFollowing,
  onFollowChange,
}: {
  targetUserId: number
  initialFollowing: boolean
  onFollowChange?: (following: boolean) => void
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, startTransition] = useTransition()

  const handleClick = () => {
    const next = !following
    setFollowing(next)
    // Lets parents react instantly (e.g. Explore swaps the suggestion card);
    // called again with the reverted value if the toggle fails.
    onFollowChange?.(next)
    startTransition(async () => {
      try {
        const result = await toggleFollow(targetUserId)
        setFollowing(result.following)
        if (result.following !== next) onFollowChange?.(result.following)
        router.refresh()
      } catch {
        setFollowing(!next)
        onFollowChange?.(!next)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
        following
          ? 'bg-red-500 text-white shadow-md shadow-red-500/30 hover:bg-red-600'
          : 'btn-primary'
      }`}
    >
      {following ? 'Unfollow' : 'Follow'}
    </button>
  )
}

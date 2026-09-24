'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { toggleFollow } from '@/actions/follows'

export function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: number
  initialFollowing: boolean
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, startTransition] = useTransition()

  const handleClick = () => {
    setFollowing(!following)
    startTransition(async () => {
      const result = await toggleFollow(targetUserId)
      setFollowing(result.following)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all disabled:opacity-50 ${
        following
          ? 'border border-white/60 bg-white/60 text-neutral-600 shadow-sm backdrop-blur hover:text-red-500'
          : 'btn-primary'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  )
}

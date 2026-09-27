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

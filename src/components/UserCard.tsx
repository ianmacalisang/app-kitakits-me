import Link from 'next/link'
import { memo } from 'react'

import type { UserCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { FollowButton } from './FollowButton'
import { TrophyIcon } from './icons'

export const UserCard = memo(function UserCard({ user }: { user: UserCardData }) {
  return (
    <li className="glass flex items-center gap-3 rounded-3xl p-4 transition-transform duration-300 hover:-translate-y-0.5">
      <Link href={`/profile/${user.username}`}>
        <Avatar src={user.avatarUrl} name={user.name} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/profile/${user.username}`} className="hover:underline">
          <p className="truncate text-sm font-semibold">
            {user.name} <BadgeMark badge={user.topBadge} />
          </p>
        </Link>
        <p className="flex items-center gap-1.5 truncate text-xs text-neutral-500">
          <span className="truncate">
            @{user.username}
            {user.followerCount !== undefined && (
              <>
                {' '}
                · {user.followerCount} {user.followerCount === 1 ? 'follower' : 'followers'}
              </>
            )}
          </span>
          <span
            title={`${user.points} pts`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-500/20"
          >
            <TrophyIcon className="h-2.5 w-2.5" />
            {user.level.name}
          </span>
        </p>
        {user.bio && <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{user.bio}</p>}
      </div>
      {!user.isSelf && <FollowButton targetUserId={user.id} initialFollowing={user.isFollowing} />}
    </li>
  )
})

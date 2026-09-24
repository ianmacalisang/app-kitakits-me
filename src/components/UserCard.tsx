import Link from 'next/link'
import { memo } from 'react'

import type { UserCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'

export const UserCard = memo(function UserCard({ user }: { user: UserCardData }) {
  return (
    <li className="glass flex items-center gap-3 rounded-3xl p-4 transition-transform duration-300 hover:-translate-y-0.5">
      <Link href={`/profile/${user.username}`}>
        <Avatar src={user.avatarUrl} name={user.name} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/profile/${user.username}`} className="hover:underline">
          <p className="truncate text-sm font-semibold">{user.name}</p>
        </Link>
        <p className="truncate text-xs text-neutral-500">
          @{user.username}
          {user.followerCount !== undefined && (
            <>
              {' '}
              · {user.followerCount} {user.followerCount === 1 ? 'follower' : 'followers'}
            </>
          )}
        </p>
        {user.bio && <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{user.bio}</p>}
      </div>
      {!user.isSelf && <FollowButton targetUserId={user.id} initialFollowing={user.isFollowing} />}
    </li>
  )
})

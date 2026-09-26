import Link from 'next/link'
import { memo } from 'react'

import { toCdnUrl } from '@/lib/cdn'
import type { UserCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BlurImage } from './BlurImage'
import { FollowButton } from './FollowButton'

// Cover-banner user card — cover image, overlapping avatar, follower count.
// Used by Explore and the profile Connections lists. On the public /@handle
// page it links to public profiles and hides the follow button.
export const UserCoverCard = memo(function UserCoverCard({
  user,
  isPublicPage = false,
  className = '',
}: {
  user: UserCardData
  isPublicPage?: boolean
  className?: string
}) {
  const cover = toCdnUrl(user.coverUrl)
  const href = isPublicPage ? `/@${user.username}` : `/profile/${user.username}`
  return (
    <li
      className={`glass flex flex-col overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-0.5 ${className}`}
    >
      <Link
        href={href}
        aria-label={user.name}
        className="block h-20 bg-gradient-to-br from-accent-500 via-accent-500 to-accent-700 sm:h-24"
      >
        {cover ? <BlurImage src={cover} alt="" className="h-full w-full object-cover" /> : null}
      </Link>
      <div className="flex flex-1 flex-col items-center px-4 pb-4 text-center">
        <Link href={href} className="-mt-10 inline-flex rounded-full ring-4 ring-white/70">
          <Avatar src={user.avatarUrl} name={user.name} size="lg" />
        </Link>
        <Link href={href} className="mt-2 block max-w-full hover:underline">
          <p className="truncate text-base font-semibold">{user.name}</p>
        </Link>
        <p className="w-full truncate text-sm text-neutral-500">
          @{user.username}
          {user.followerCount !== undefined && (
            <>
              {' '}
              · {user.followerCount} {user.followerCount === 1 ? 'follower' : 'followers'}
            </>
          )}
        </p>
        {!isPublicPage && !user.isSelf && (
          <div className="mt-auto w-full pt-3 [&_button]:w-full [&_button]:py-2">
            <FollowButton targetUserId={user.id} initialFollowing={user.isFollowing} />
          </div>
        )}
      </div>
    </li>
  )
})

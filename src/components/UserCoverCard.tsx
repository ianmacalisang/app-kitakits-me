import Link from 'next/link'
import { memo } from 'react'

import { toCdnUrl } from '@/lib/cdn'
import type { UserCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { BlurImage } from './BlurImage'
import { FollowButton } from './FollowButton'
import { TrophyIcon } from './icons'

// Compact cover-card — the cover image fills the whole card and the
// avatar, name, and follow button float on a scrim. Used by Explore and
// the profile Connections lists. On the public /@handle page it links to
// public profiles and hides the follow button.
export const UserCoverCard = memo(function UserCoverCard({
  user,
  isPublicPage = false,
  className = '',
  onFollowChange,
}: {
  user: UserCardData
  isPublicPage?: boolean
  className?: string
  onFollowChange?: (following: boolean) => void
}) {
  const cover = toCdnUrl(user.coverUrl)
  const href = isPublicPage ? `/@${user.username}` : `/profile/${user.username}`
  return (
    <li
      className={`glass group relative flex flex-col overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-0.5 ${className}`}
    >
      {/* Cover fills the whole card */}
      {cover ? (
        <BlurImage
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent-500 via-accent-500 to-accent-700" />
      )}
      {/* Scrim — keeps the overlaid text readable */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/70" />

      {/* Whole-card link — sits behind the content; the overlay below is
          pointer-events-none except on its own links/button. */}
      <Link href={href} aria-label={user.name} className="absolute inset-0" />

      <div className="pointer-events-none relative mt-auto flex flex-col items-center px-3 pb-3 pt-14 text-center">
        <Link
          href={href}
          className="pointer-events-auto inline-flex rounded-full ring-2 ring-white/70"
        >
          <Avatar src={user.avatarUrl} name={user.name} size="md" />
        </Link>
        <Link href={href} className="pointer-events-auto mt-1.5 block max-w-full hover:underline">
          <p className="truncate text-sm font-semibold text-white drop-shadow-sm">
            {user.name} <BadgeMark badge={user.topBadge} light />
          </p>
        </Link>
        <p className="w-full truncate text-xs text-white/75">
          @{user.username}
          {user.followerCount !== undefined && (
            <>
              {' '}
              · {user.followerCount} {user.followerCount === 1 ? 'follower' : 'followers'}
            </>
          )}
        </p>
        <span
          title={`${user.points} pts · ${user.level.name}`}
          className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-white/25 backdrop-blur"
        >
          <TrophyIcon className="h-2.5 w-2.5" />
          {user.level.name}
        </span>
        {!isPublicPage && !user.isSelf && (
          <div className="pointer-events-auto mt-2.5 w-full [&_button]:w-full [&_button]:py-1.5 [&_button]:text-xs">
            <FollowButton
              targetUserId={user.id}
              initialFollowing={user.isFollowing}
              onFollowChange={onFollowChange}
            />
          </div>
        )}
      </div>
    </li>
  )
})

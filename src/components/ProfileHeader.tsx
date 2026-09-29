import Link from 'next/link'

import type { GamificationData } from '@/lib/serialize'

import { FollowButton } from './FollowButton'
import { FollowListModal } from './FollowListModal'
import { MailboxIcon } from './icons'
import { LevelChip } from './LevelChip'
import { ProfileMedia } from './ProfileMedia'

export function ProfileHeader({
  userId,
  name,
  username,
  bio,
  website,
  avatarUrl,
  coverUrl,
  followerCount,
  isSelf,
  initialFollowing,
  gamification,
}: {
  userId: number
  name: string
  username: string
  bio: string | null
  website: string | null
  avatarUrl?: string
  coverUrl?: string
  followerCount: number
  isSelf: boolean
  initialFollowing: boolean
  gamification?: GamificationData
}) {
  return (
    <header className="glass relative overflow-hidden rounded-3xl">
      <ProfileMedia
        isSelf={isSelf}
        avatarUrl={avatarUrl}
        coverUrl={coverUrl}
        name={name}
        username={username}
        badge={gamification?.badges[0]}
        stats={
          <>
            <FollowListModal
              userId={userId}
              kind="followers"
              count={followerCount}
              label="Followers"
              badge
            />
            {gamification && (
              <LevelChip level={gamification.level} points={gamification.points} light />
            )}
          </>
        }
      >
        {!isSelf && (
          <span className="flex items-center gap-2">
            <FollowButton targetUserId={userId} initialFollowing={initialFollowing} />
            <Link
              href={`/mailbox?to=${username}`}
              aria-label={`Mail @${username}`}
              title={`Mail @${username}`}
              className="group/mail relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/30 hover:shadow-lg hover:shadow-black/25 hover:ring-white/50 active:translate-y-0 active:scale-95"
            >
              {/* Ambient sonar ring — slow ripple to draw the eye */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-full ring-2 ring-white/60 opacity-0 motion-safe:animate-mail-ring"
              />
              <MailboxIcon className="h-5 w-5 drop-shadow-sm transition-transform duration-300 group-hover/mail:-rotate-6 group-hover/mail:scale-110" />
            </Link>
          </span>
        )}
      </ProfileMedia>

      <div className="relative px-5 pb-5 sm:px-6 sm:pb-6">
        {bio && <p className="mt-3 whitespace-pre-wrap text-[15px] text-white/90">{bio}</p>}

        {website && (
          <a
            href={website.startsWith('http') ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-accent-300 hover:text-accent-200 hover:underline"
          >
            {website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
    </header>
  )
}

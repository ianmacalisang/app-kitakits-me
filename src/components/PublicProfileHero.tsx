import type { ReactNode } from 'react'

import type { ProfileLayout } from '@/lib/profileDesign'

import { Avatar } from './Avatar'
import { BlurImage } from './BlurImage'
import { CalendarIcon, LinkIcon } from './icons'

// Website/joined/follower chips — `light` variants sit over the cover image in
// the hero layout, the neutral ones on the card body.
function MetaChips({
  website,
  joinedLabel,
  followers,
  following,
  light = false,
}: {
  website: string | null
  joinedLabel: string
  followers: number
  following: number
  light?: boolean
}) {
  const chip = light
    ? 'inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white/90 ring-1 ring-white/25 backdrop-blur'
    : 'inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-600'
  const count = light ? 'font-bold text-white' : 'font-bold text-neutral-800'

  return (
    <>
      {website && (
        <a
          href={website.startsWith('http') ? website : `https://${website}`}
          target="_blank"
          rel="noopener noreferrer"
          className={
            light
              ? chip
              : 'inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-2.5 py-1 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-500/20 transition-colors hover:bg-accent-500/20'
          }
        >
          <LinkIcon className="h-3.5 w-3.5" />
          {website.replace(/^https?:\/\//, '')}
        </a>
      )}
      <span className={chip}>
        <CalendarIcon className="h-3.5 w-3.5" />
        Joined {joinedLabel}
      </span>
      <span className={chip}>
        <strong className={count}>{followers}</strong>
        Followers
      </span>
      <span className={chip}>
        <strong className={count}>{following}</strong>
        Following
      </span>
    </>
  )
}

export function PublicProfileHero({
  layout,
  name,
  username,
  bio,
  website,
  avatar,
  cover,
  joinedLabel,
  followers,
  following,
  action,
}: {
  layout: ProfileLayout
  name: string
  username: string
  bio: string | null
  website: string | null
  avatar?: string
  cover?: string
  joinedLabel: string
  followers: number
  following: number
  // CTA slot — "Public preview" badge for the owner, mail button otherwise.
  action?: ReactNode
}) {
  if (layout === 'minimal') {
    // No banner — but a set cover still fills the card as a dimmed backdrop
    // behind the centered identity, so the photo always shows through.
    const onCover = Boolean(cover)
    return (
      <header className="glass relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl px-5 py-8 text-center sm:px-6">
        {onCover && (
          <div aria-hidden className="absolute inset-0">
            <BlurImage src={cover} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/45" />
          </div>
        )}
        <span className="relative inline-flex shrink-0 rounded-full shadow-lg ring-4 ring-white/90">
          <Avatar src={avatar} name={name} size="xl" />
        </span>
        <h1
          className={`relative mt-1.5 text-xl font-bold tracking-tight sm:text-2xl ${
            onCover ? 'text-white drop-shadow-sm' : 'text-neutral-900'
          }`}
        >
          {name}
        </h1>
        <p className={`relative text-sm ${onCover ? 'text-white/75' : 'text-neutral-500'}`}>
          @{username}
        </p>
        {bio && (
          <p
            className={`relative mt-1 whitespace-pre-wrap text-sm leading-relaxed ${
              onCover ? 'text-white/90' : 'text-neutral-700'
            }`}
          >
            {bio}
          </p>
        )}
        <div className="relative mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <MetaChips
            website={website}
            joinedLabel={joinedLabel}
            followers={followers}
            following={following}
            light={onCover}
          />
        </div>
        {action && <div className="relative mt-2">{action}</div>}
      </header>
    )
  }

  if (layout === 'hero') {
    return (
      <header className="glass relative overflow-hidden rounded-3xl">
        {/* Cover fills the whole card behind the overlaid identity */}
        <div className="absolute inset-0">
          {cover ? (
            <BlurImage src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-accent-500 via-accent-500 to-accent-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/70" />
        </div>

        <div className="relative flex flex-col gap-3 px-5 pb-5 pt-40 sm:px-6 sm:pb-6 sm:pt-48">
          <div className="flex items-end justify-between gap-4">
            <span className="inline-flex shrink-0 rounded-full shadow-lg ring-4 ring-white/70">
              <Avatar src={avatar} name={name} size="xl" />
            </span>
            {action}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">
              {name}
            </h1>
            <p className="text-sm text-white/75">@{username}</p>
          </div>
          {bio && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{bio}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <MetaChips
              website={website}
              joinedLabel={joinedLabel}
              followers={followers}
              following={following}
              light
            />
          </div>
        </div>
      </header>
    )
  }

  // classic — banner cover, avatar overlapping the edge, then identity,
  // meta chips, and the CTA on the card body.
  return (
    <header className="glass overflow-hidden rounded-3xl">
      <div className="relative h-52 sm:h-60">
        {cover ? (
          <BlurImage src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent-500 via-accent-500 to-accent-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
      </div>

      {/* `relative` lifts the body above the positioned banner so the
          avatar overlaps the cover instead of sitting underneath it. */}
      <div className="relative px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-8 flex items-end justify-between gap-4 sm:-mt-10">
          <span className="inline-flex shrink-0 rounded-full shadow-lg ring-4 ring-white/90">
            <Avatar src={avatar} name={name} size="xl" />
          </span>
          {action}
        </div>

        <h1 className="mt-2.5 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
          {name}
        </h1>
        <p className="text-sm text-neutral-500">@{username}</p>

        {bio && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{bio}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <MetaChips
            website={website}
            joinedLabel={joinedLabel}
            followers={followers}
            following={following}
          />
        </div>
      </div>
    </header>
  )
}

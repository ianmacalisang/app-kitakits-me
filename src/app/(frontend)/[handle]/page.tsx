import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { Avatar } from '@/components/Avatar'
import { BrandMark } from '@/components/Branding'
import { CalendarIcon, LinkIcon, LockIcon } from '@/components/icons'
import { ProfileTabs } from '@/components/ProfileTabs'
import { PublicMailButton } from '@/components/PublicMailButton'
import { ShareProfileButton } from '@/components/ShareProfileButton'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { FEED_PAGE_SIZE, hydratePosts } from '@/lib/posts'
import { avatarUrl, coverUrl, toAboutBlocks } from '@/lib/serialize'
import { getSiteSettings } from '@/lib/settings'

// Public profiles live at /@username. The leading '@' in `handle` is what
// distinguishes a share link from any other single-segment URL.
const findProfileByHandle = cache(async (handle: string) => {
  if (!handle.startsWith('@')) return null
  const username = handle.slice(1)
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return null

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'users',
    where: { username: { equals: username } },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const [user, settings] = await Promise.all([
    findProfileByHandle(decodeURIComponent(handle)),
    getSiteSettings(),
  ])
  // Keep metadata generic until the owner enables "Public profile".
  if (!user?.publicProfile) return { title: { absolute: settings.metaTitle } }
  return {
    title: `${user.name} (@${user.username})`,
    description: user.bio ?? `View @${user.username}'s profile on ${settings.appName}.`,
  }
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const profileUser = await findProfileByHandle(decodeURIComponent(handle))
  if (!profileUser) notFound()

  const payload = await getPayloadClient()
  const [viewer, settings] = await Promise.all([getCurrentUser(), getSiteSettings()])

  if (!profileUser.publicProfile) {
    return (
      <main>
        <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
          <Link href="/" className="mb-4 flex w-fit items-center gap-2.5">
            <BrandMark size="sm" />
          </Link>

          <div className="glass flex flex-col items-center gap-2 rounded-3xl p-8 text-center">
            <LockIcon className="h-6 w-6 text-neutral-400" />
            <p className="text-sm font-semibold">This profile is not public</p>
            <p className="text-xs text-neutral-500">It can&apos;t be viewed right now.</p>
          </div>
        </div>
      </main>
    )
  }

  const isSelf = viewer?.id === profileUser.id
  const canViewPosts = !profileUser.isPrivate

  const [followers, following, posts, pinned] = await Promise.all([
    payload.count({
      collection: 'follows',
      where: { following: { equals: profileUser.id } },
    }),
    payload.count({
      collection: 'follows',
      where: { follower: { equals: profileUser.id } },
    }),
    canViewPosts
      ? payload.find({
          collection: 'posts',
          // Mirror the anonymous canReadPosts constraint — relationships only
          // populate when access is overridden, so filtering here keeps this
          // equivalent to what signed-out readers may see.
          where: {
            and: [
              { author: { equals: profileUser.id } },
              { visibility: { not_equals: 'followers' } },
            ],
          },
          sort: '-createdAt',
          page: 1,
          limit: FEED_PAGE_SIZE,
          depth: 2,
        })
      : Promise.resolve({ docs: [], hasNextPage: false }),
    canViewPosts
      ? payload.find({
          collection: 'posts',
          where: {
            and: [
              { author: { equals: profileUser.id } },
              { pinned: { equals: true } },
              { visibility: { not_equals: 'followers' } },
            ],
          },
          sort: '-createdAt',
          limit: 10,
          depth: 2,
        })
      : Promise.resolve({ docs: [], hasNextPage: false }),
  ])

  const [cards, pinnedCards] = await Promise.all([
    hydratePosts(posts.docs, viewer),
    hydratePosts(pinned.docs, viewer),
  ])

  const avatar = avatarUrl(profileUser)
  const cover = coverUrl(profileUser)
  const joinedLabel = new Date(profileUser.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <main>
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <BrandMark size="sm" />
          </Link>
          <ShareProfileButton username={profileUser.username} name={profileUser.name} />
        </div>

        <div className="flex flex-col gap-4">
          {/* Hero — banner cover, avatar overlapping the edge, then identity,
              meta chips, and the CTA on the card body. */}
          <header className="glass overflow-hidden rounded-3xl">
            <div className="relative h-52 sm:h-60">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-700" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
            </div>

            {/* `relative` lifts the body above the positioned banner so the
                avatar overlaps the cover instead of sitting underneath it. */}
            <div className="relative px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="-mt-8 flex items-end justify-between gap-4 sm:-mt-10">
                <span className="inline-flex shrink-0 rounded-full shadow-lg ring-4 ring-white/90">
                  <Avatar src={avatar} name={profileUser.name} size="xl" />
                </span>
                {isSelf ? (
                  <span className="mb-1 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                    Public preview
                  </span>
                ) : (
                  <PublicMailButton
                    variant="inline"
                    username={profileUser.username}
                    recipientName={profileUser.name}
                    isLoggedIn={Boolean(viewer)}
                  />
                )}
              </div>

              <h1 className="mt-2.5 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
                {profileUser.name}
              </h1>
              <p className="text-sm text-neutral-500">@{profileUser.username}</p>

              {profileUser.bio && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                  {profileUser.bio}
                </p>
              )}

              {/* Meta chips — website, joined date, and the social counts */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {profileUser.website && (
                  <a
                    href={
                      profileUser.website.startsWith('http')
                        ? profileUser.website
                        : `https://${profileUser.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/20 transition-colors hover:bg-emerald-500/20"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    {profileUser.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-600">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Joined {joinedLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-600">
                  <strong className="font-bold text-neutral-800">{followers.totalDocs}</strong>
                  Followers
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-600">
                  <strong className="font-bold text-neutral-800">{following.totalDocs}</strong>
                  Following
                </span>
              </div>
            </div>
          </header>

          {canViewPosts ? (
            <ProfileTabs
              initialPosts={cards}
              initialHasMore={posts.hasNextPage}
              pinnedPosts={pinnedCards}
              authorId={profileUser.id}
              about={toAboutBlocks(profileUser)}
              isSelf={false}
              username={profileUser.username}
              followerCount={followers.totalDocs}
              followingCount={following.totalDocs}
              isPublicPage
            />
          ) : (
            <div className="glass flex flex-col items-center gap-2 rounded-3xl p-8 text-center">
              <LockIcon className="h-6 w-6 text-neutral-400" />
              <p className="text-sm font-semibold">This account is private</p>
              <p className="text-xs text-neutral-500">
                Follow @{profileUser.username} on {settings.appName} to see their posts.
              </p>
            </div>
          )}
        </div>

        {!viewer && (
          <p className="mt-8 text-center text-xs text-neutral-400">
            <Link
              href="/register"
              className="font-medium text-emerald-700/80 hover:text-emerald-700 hover:underline"
            >
              Create your own profile
            </Link>{' '}
            on {settings.appName}
          </p>
        )}
      </div>
    </main>
  )
}

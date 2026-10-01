import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { BadgeProgressPanel } from '@/components/BadgeProgressPanel'
import { BlurImage } from '@/components/BlurImage'
import { BrandMark } from '@/components/Branding'
import { LockIcon } from '@/components/icons'
import { ProfileTabs } from '@/components/ProfileTabs'
import { ProfileViewBeacon } from '@/components/ProfileViewBeacon'
import { PublicMailButton } from '@/components/PublicMailButton'
import { PrePaintTheme } from '@/components/PrePaintTheme'
import { PublicPageTheme } from '@/components/PublicPageTheme'
import { PublicProfileHero } from '@/components/PublicProfileHero'
import { ShareProfileButton } from '@/components/ShareProfileButton'
import { getCurrentUser } from '@/lib/auth'
import { getBadgeProgressForUser, getUserGamification } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import { FEED_PAGE_SIZE, hydratePosts } from '@/lib/posts'
import {
  profileAccentValue,
  profileCardStyleValue,
  profileLayoutValue,
  profileThemeValue,
} from '@/lib/profileDesign'
import {
  avatarUrl,
  coverUrl,
  mediaUrl,
  toAboutBlocks,
  toTestimonialData,
  type TestimonialData,
} from '@/lib/serialize'
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

  const [
    followers,
    following,
    posts,
    pinned,
    testimonials,
    myTestimonial,
    viewerFollows,
    pendingTestimonials,
    gamification,
    badgeProgress,
  ] = await Promise.all([
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
    canViewPosts
      ? payload.find({
          collection: 'testimonials',
          where: {
            and: [{ recipient: { equals: profileUser.id } }, { status: { equals: 'approved' } }],
          },
          sort: '-createdAt',
          limit: 20,
          depth: 2,
          ...(viewer ? { user: viewer, overrideAccess: false as const } : {}),
        })
      : Promise.resolve({ docs: [], hasNextPage: false }),
    viewer && !isSelf && canViewPosts
      ? payload.find({
          collection: 'testimonials',
          where: {
            and: [{ author: { equals: viewer.id } }, { recipient: { equals: profileUser.id } }],
          },
          limit: 1,
          depth: 2,
          user: viewer,
          overrideAccess: false,
        })
      : Promise.resolve({ docs: [] }),
    viewer && !isSelf && canViewPosts
      ? payload.count({
          collection: 'follows',
          where: {
            and: [{ follower: { equals: viewer.id } }, { following: { equals: profileUser.id } }],
          },
          user: viewer,
          overrideAccess: false,
        })
      : Promise.resolve({ totalDocs: 0 }),
    viewer && isSelf
      ? payload.count({
          collection: 'testimonials',
          where: {
            and: [{ recipient: { equals: viewer.id } }, { status: { equals: 'pending' } }],
          },
          user: viewer,
          overrideAccess: false,
        })
      : Promise.resolve({ totalDocs: 0 }),
    getUserGamification(payload, profileUser.id),
    getBadgeProgressForUser(payload, profileUser.id),
  ])

  const testimonialPermission = profileUser.testimonialPermission ?? 'everyone'
  const canWriteTestimonial =
    Boolean(viewer) &&
    !isSelf &&
    testimonialPermission !== 'off' &&
    (!(testimonialPermission === 'followers' || profileUser.isPrivate) ||
      viewerFollows.totalDocs > 0 ||
      viewer?.role === 'admin')

  const [cards, pinnedCards] = await Promise.all([
    hydratePosts(posts.docs, viewer),
    hydratePosts(pinned.docs, viewer),
  ])

  const avatar = avatarUrl(profileUser)
  const cover = coverUrl(profileUser)
  const background = mediaUrl(profileUser.profileBackground)
  const layout = profileLayoutValue(profileUser)
  const accent = profileAccentValue(profileUser)
  const cardStyle = profileCardStyleValue(profileUser)
  const theme = profileThemeValue(profileUser)
  const joinedLabel = new Date(profileUser.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <main
      data-profile-accent={accent === 'default' ? undefined : accent}
      data-profile-cards={cardStyle === 'glass' ? undefined : cardStyle}
    >
      {/* Owner-chosen page theme — the script applies it pre-paint on first
          load; the component covers client-side navigation and restores the
          visitor's own theme on exit. */}
      <PrePaintTheme dark={theme === 'dark'} />
      <PublicPageTheme theme={theme} visitorTheme={viewer?.theme ?? 'light'} />

      {/* Custom page backdrop — a fixed layer under the content. Positioned
          after the body's negative-z aurora pseudo-elements; the content
          wrapper's `relative` keeps it painted underneath. */}
      {background && (
        <div aria-hidden className="fixed inset-0">
          <BlurImage src={background} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-white/55 dark:bg-black/55" />
        </div>
      )}

      <div className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        {viewer && !isSelf && viewer.profileViewTracking && (
          <ProfileViewBeacon viewedId={profileUser.id} />
        )}
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <BrandMark size="sm" />
          </Link>
          <ShareProfileButton username={profileUser.username} name={profileUser.name} />
        </div>

        <div className="flex flex-col gap-4">
          <PublicProfileHero
            layout={layout}
            name={profileUser.name}
            username={profileUser.username}
            bio={profileUser.bio ?? null}
            website={profileUser.website ?? null}
            avatar={avatar}
            cover={cover}
            joinedLabel={joinedLabel}
            followers={followers.totalDocs}
            following={following.totalDocs}
            gamification={gamification}
            action={
              isSelf ? (
                <span
                  className={`mb-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
                    layout === 'hero' || (layout === 'minimal' && cover)
                      ? 'bg-white/15 text-white ring-white/30 backdrop-blur'
                      : 'bg-accent-500/10 text-accent-700 ring-accent-500/20'
                  }`}
                >
                  Public preview
                </span>
              ) : (
                <PublicMailButton
                  variant="inline"
                  username={profileUser.username}
                  recipientName={profileUser.name}
                  isLoggedIn={Boolean(viewer)}
                />
              )
            }
          />

          {canViewPosts ? (
            <>
              <BadgeProgressPanel badges={badgeProgress} />
              <ProfileTabs
                initialPosts={cards}
                initialHasMore={posts.hasNextPage}
                pinnedPosts={pinnedCards}
                authorId={profileUser.id}
                about={toAboutBlocks(profileUser)}
                isSelf={Boolean(isSelf)}
                name={profileUser.name}
                username={profileUser.username}
                followerCount={followers.totalDocs}
                followingCount={following.totalDocs}
                testimonials={{
                  items: testimonials.docs
                    .map((doc) => toTestimonialData(doc, viewer))
                    .filter((t): t is TestimonialData => t !== null),
                  hasMore: testimonials.hasNextPage,
                  mine: myTestimonial.docs[0]
                    ? toTestimonialData(myTestimonial.docs[0], viewer)
                    : null,
                  canWrite: canWriteTestimonial,
                  viewerAuthenticated: Boolean(viewer),
                  pendingCount: pendingTestimonials.totalDocs,
                }}
                isPublicPage
              />
            </>
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
              className="font-medium text-accent-700/80 hover:text-accent-700 hover:underline"
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

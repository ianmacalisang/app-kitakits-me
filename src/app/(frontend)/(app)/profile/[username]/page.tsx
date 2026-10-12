import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { BadgeProgressPanel } from '@/components/BadgeProgressPanel'
import { BlurImage } from '@/components/BlurImage'
import { FollowButton } from '@/components/FollowButton'
import { LockIcon, MailboxIcon } from '@/components/icons'
import { ProfileDesignSheet } from '@/components/ProfileDesignSheet'
import { ProfileTabs } from '@/components/ProfileTabs'
import { ProfileViewBeacon } from '@/components/ProfileViewBeacon'
import { PublicProfileHero } from '@/components/PublicProfileHero'
import { getCurrentUser } from '@/lib/auth'
import { getBadgeProgressForUser, getUserGamification } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import { FEED_PAGE_SIZE, hydratePosts } from '@/lib/posts'
import {
  profileAccentValue,
  profileCardStyleValue,
  profileFontValue,
  profileLayoutValue,
  profileThemeValue,
} from '@/lib/profileDesign'
import { PROFILE_FONT_FAMILIES } from '@/lib/profileFonts'
import {
  avatarUrl,
  coverUrl,
  mediaUrl,
  toAboutBlocks,
  toTestimonialData,
  type TestimonialData,
} from '@/lib/serialize'
import { MEDIA_GRID_TABS, PROFILE_TABS, type MediaGridTab, type ProfileTab } from '@/lib/tabs'

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ tab?: string; media?: string }>
}) {
  const { username } = await params
  const { tab: rawTab, media: rawMedia } = await searchParams
  // ?tab= persists the selected profile tab across refreshes and shares;
  // ?media=images|videos does the same for the Media sub-tab.
  const initialTab: ProfileTab | undefined = (PROFILE_TABS as readonly string[]).includes(
    rawTab ?? '',
  )
    ? (rawTab as ProfileTab)
    : undefined
  const initialMediaType: MediaGridTab | undefined = (
    MEDIA_GRID_TABS as readonly string[]
  ).includes(rawMedia ?? '')
    ? (rawMedia as MediaGridTab)
    : undefined
  const viewer = await getCurrentUser()
  if (!viewer) redirect('/login')

  const payload = await getPayloadClient()

  const userResult = await payload.find({
    collection: 'users',
    where: { username: { equals: username } },
    limit: 1,
    depth: 1,
    user: viewer,
    overrideAccess: false,
  })
  const profileUser = userResult.docs[0]
  if (!profileUser) notFound()

  const isSelf = profileUser.id === viewer.id

  const [
    followers,
    following,
    existingFollow,
    posts,
    pinned,
    testimonials,
    myTestimonial,
    pendingTestimonials,
    gamification,
    badgeProgress,
  ] = await Promise.all([
    payload.count({
      collection: 'follows',
      where: { following: { equals: profileUser.id } },
      user: viewer,
      overrideAccess: false,
    }),
    payload.count({
      collection: 'follows',
      where: { follower: { equals: profileUser.id } },
      user: viewer,
      overrideAccess: false,
    }),
    payload.count({
      collection: 'follows',
      where: {
        and: [{ follower: { equals: viewer.id } }, { following: { equals: profileUser.id } }],
      },
      user: viewer,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'posts',
      where: { author: { equals: profileUser.id } },
      sort: '-createdAt',
      page: 1,
      limit: FEED_PAGE_SIZE,
      depth: 2,
      user: viewer,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'posts',
      where: {
        and: [{ author: { equals: profileUser.id } }, { pinned: { equals: true } }],
      },
      sort: '-createdAt',
      limit: 10,
      depth: 2,
      user: viewer,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'testimonials',
      where: {
        and: [{ recipient: { equals: profileUser.id } }, { status: { equals: 'approved' } }],
      },
      sort: '-createdAt',
      limit: 20,
      depth: 2,
      user: viewer,
      overrideAccess: false,
    }),
    isSelf
      ? Promise.resolve({ docs: [] })
      : payload.find({
          collection: 'testimonials',
          where: {
            and: [{ author: { equals: viewer.id } }, { recipient: { equals: profileUser.id } }],
          },
          limit: 1,
          depth: 2,
          user: viewer,
          overrideAccess: false,
        }),
    isSelf
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

  const [cards, pinnedCards] = await Promise.all([
    hydratePosts(posts.docs, viewer),
    hydratePosts(pinned.docs, viewer),
  ])

  const isFollowing = existingFollow.totalDocs > 0
  const canViewPosts = !profileUser.isPrivate || isSelf || isFollowing || viewer.role === 'admin'

  // Mirrors canWriteTestimonial so the form doesn't even render for people the
  // recipient's settings would reject anyway.
  const testimonialPermission = profileUser.testimonialPermission ?? 'everyone'
  const canWriteTestimonial =
    !isSelf &&
    testimonialPermission !== 'off' &&
    (!(testimonialPermission === 'followers' || profileUser.isPrivate) ||
      isFollowing ||
      viewer.role === 'admin')

  // Owner's public-profile design, mirrored on the in-app page. The theme is
  // scoped to a `dark`/`light` wrapper (the `.light` escape built into the
  // dark palette rules) so the AppNav header and dock keep the viewer's theme.
  const avatar = avatarUrl(profileUser)
  const cover = coverUrl(profileUser)
  const background = mediaUrl(profileUser.profileBackground)
  const layout = profileLayoutValue(profileUser)
  const accent = profileAccentValue(profileUser)
  const cardStyle = profileCardStyleValue(profileUser)
  const theme = profileThemeValue(profileUser)
  const fontFamily = PROFILE_FONT_FAMILIES[profileFontValue(profileUser)]
  const joinedLabel = new Date(profileUser.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
  // Hero actions sit over the cover photo in the hero/minimal layouts; on the
  // classic card body they need the neutral/accent variants.
  const overCover = layout === 'hero' || (layout === 'minimal' && Boolean(cover))

  return (
    <>
      {/* Owner's canvas — theme-colored backdrop behind the page content (the
          viewer's aurora is covered while the design is shown). Kept outside
          the theme scope with explicit colors; AppNav's z-30/z-40 chrome stays
          above it and keeps the viewer's theme. */}
      <div
        aria-hidden
        className={`fixed inset-0 ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#f4f4f4]'}`}
      >
        {background && (
          <>
            <BlurImage
              src={background}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className={`absolute inset-0 ${theme === 'dark' ? 'bg-black/55' : 'bg-white/55'}`}
            />
          </>
        )}
      </div>

      {/* Design-sheet entry — app chrome like the nav, so it stays outside the
          design scope in the viewer's own theme/accent/font. `relative` lifts
          it above the fixed canvas. */}
      {isSelf && (
        <div className="relative mb-6">
          <ProfileDesignSheet
            username={profileUser.username}
            publicProfile={profileUser.publicProfile ?? false}
            initial={{
              layout,
              accent,
              cardStyle,
              theme,
              font: profileFontValue(profileUser),
              backgroundUrl: background,
            }}
            preview={{
              name: profileUser.name,
              username: profileUser.username,
              bio: profileUser.bio ?? null,
              website: profileUser.website ?? null,
              avatarUrl: avatar,
              coverUrl: cover,
              joinedLabel,
              followers: followers.totalDocs,
              following: following.totalDocs,
            }}
          />
        </div>
      )}

      <div className={theme === 'dark' ? 'dark' : 'light'}>
        <div
          data-profile-accent={accent === 'default' ? undefined : accent}
          data-profile-cards={cardStyle === 'glass' ? undefined : cardStyle}
          style={fontFamily ? { fontFamily } : undefined}
          className="relative flex flex-col gap-6 text-neutral-900 dark:text-neutral-100"
        >
          {!isSelf && viewer.profileViewTracking && <ProfileViewBeacon viewedId={profileUser.id} />}
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
                <Link
                  href="/settings"
                  className={`mb-1 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
                    overCover
                      ? 'bg-white/15 text-white ring-white/30 backdrop-blur'
                      : 'bg-accent-500/10 text-accent-700 ring-accent-500/20'
                  }`}
                >
                  Edit profile
                </Link>
              ) : (
                <span className="flex items-center gap-2">
                  <FollowButton targetUserId={profileUser.id} initialFollowing={isFollowing} />
                  <Link
                    href={`/mailbox?to=${profileUser.username}`}
                    aria-label={`Mail @${profileUser.username}`}
                    title={`Mail @${profileUser.username}`}
                    className={`group/mail relative flex h-9 w-9 items-center justify-center rounded-full ring-1 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-95 ${
                      overCover
                        ? 'bg-white/15 text-white ring-white/30 hover:bg-white/30 hover:shadow-black/25 hover:ring-white/50'
                        : 'bg-accent-500/10 text-accent-700 ring-accent-500/20 hover:bg-accent-500/20 hover:shadow-accent-900/10'
                    }`}
                  >
                    {overCover && (
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full ring-2 ring-white/60 opacity-0 motion-safe:animate-mail-ring"
                      />
                    )}
                    <MailboxIcon className="h-5 w-5 drop-shadow-sm transition-transform duration-300 group-hover/mail:-rotate-6 group-hover/mail:scale-110" />
                  </Link>
                </span>
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
                isSelf={isSelf}
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
                  viewerAuthenticated: true,
                  pendingCount: pendingTestimonials.totalDocs,
                }}
                initialTab={initialTab}
                initialMediaType={initialMediaType}
              />
            </>
          ) : (
            <div className="glass flex flex-col items-center gap-2 rounded-3xl p-10 text-center">
              <LockIcon className="h-6 w-6 text-neutral-400" />
              <p className="text-sm font-semibold">This account is private</p>
              <p className="text-xs text-neutral-500">
                Follow @{profileUser.username} to see their posts.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

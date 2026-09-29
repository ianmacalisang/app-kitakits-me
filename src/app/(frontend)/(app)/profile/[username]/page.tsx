import { notFound, redirect } from 'next/navigation'

import { BadgeProgressPanel } from '@/components/BadgeProgressPanel'
import { LockIcon } from '@/components/icons'
import { ProfileDesignSheet } from '@/components/ProfileDesignSheet'
import { ProfileHeader } from '@/components/ProfileHeader'
import { ProfileTabs } from '@/components/ProfileTabs'
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

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
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

  return (
    <div className="flex flex-col gap-6">
      {isSelf && (
        <ProfileDesignSheet
          username={profileUser.username}
          publicProfile={profileUser.publicProfile ?? false}
          initial={{
            layout: profileLayoutValue(profileUser),
            accent: profileAccentValue(profileUser),
            cardStyle: profileCardStyleValue(profileUser),
            theme: profileThemeValue(profileUser),
            backgroundUrl: mediaUrl(profileUser.profileBackground),
          }}
          preview={{
            name: profileUser.name,
            username: profileUser.username,
            bio: profileUser.bio ?? null,
            website: profileUser.website ?? null,
            avatarUrl: avatarUrl(profileUser),
            coverUrl: coverUrl(profileUser),
            joinedLabel: new Date(profileUser.createdAt).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            }),
            followers: followers.totalDocs,
            following: following.totalDocs,
          }}
        />
      )}
      <ProfileHeader
        userId={profileUser.id}
        name={profileUser.name}
        username={profileUser.username}
        bio={profileUser.bio ?? null}
        website={profileUser.website ?? null}
        avatarUrl={avatarUrl(profileUser)}
        coverUrl={coverUrl(profileUser)}
        followerCount={followers.totalDocs}
        isSelf={isSelf}
        initialFollowing={isFollowing}
        gamification={gamification}
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
              mine: myTestimonial.docs[0] ? toTestimonialData(myTestimonial.docs[0], viewer) : null,
              canWrite: canWriteTestimonial,
              viewerAuthenticated: true,
              pendingCount: pendingTestimonials.totalDocs,
            }}
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
  )
}

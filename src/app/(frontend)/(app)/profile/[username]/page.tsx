import { notFound, redirect } from 'next/navigation'

import { LockIcon } from '@/components/icons'
import { ProfileHeader } from '@/components/ProfileHeader'
import { ProfileTabs } from '@/components/ProfileTabs'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { FEED_PAGE_SIZE, hydratePosts } from '@/lib/posts'
import { avatarUrl, coverUrl, toAboutBlocks } from '@/lib/serialize'

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

  const [followers, following, existingFollow, posts, pinned] = await Promise.all([
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
  ])

  const [cards, pinnedCards] = await Promise.all([
    hydratePosts(posts.docs, viewer),
    hydratePosts(pinned.docs, viewer),
  ])

  const isSelf = profileUser.id === viewer.id
  const isFollowing = existingFollow.totalDocs > 0
  const canViewPosts = !profileUser.isPrivate || isSelf || isFollowing || viewer.role === 'admin'

  return (
    <div className="flex flex-col gap-6">
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
      />
      {canViewPosts ? (
        <ProfileTabs
          initialPosts={cards}
          initialHasMore={posts.hasNextPage}
          pinnedPosts={pinnedCards}
          authorId={profileUser.id}
          about={toAboutBlocks(profileUser)}
          isSelf={isSelf}
          username={profileUser.username}
          followerCount={followers.totalDocs}
          followingCount={following.totalDocs}
        />
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

'use server'

import { getCurrentUser } from '@/lib/auth'
import type { PostCategory } from '@/lib/categories'
import { getPayloadClient } from '@/lib/payload'
import { FEED_PAGE_SIZE, categoryFilterClauses, hydratePosts, publicPostClauses } from '@/lib/posts'
import type { Paged, PostCardData } from '@/lib/serialize'

// Public posts for the Discover page — always scoped to what anonymous
// readers may see (public visibility, non-private author), whether or not
// the viewer is logged in. The explicit where-clause mirrors the anonymous
// canReadPosts constraint, so followers-only posts never leak here even
// though signed-in viewers could otherwise read some of them. Hydration
// still uses the real viewer so likes, saves, and auth-gated controls
// behave correctly for signed-in users.
export async function getDiscoverPosts(
  category?: PostCategory | 'all',
  page = 1,
  limit = FEED_PAGE_SIZE,
): Promise<Paged<PostCardData>> {
  const user = await getCurrentUser()

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    where: {
      // Reposts are share cards pointing at an original — Discover shows
      // only original posts.
      and: [
        ...publicPostClauses(),
        ...categoryFilterClauses(category),
        { sharedPost: { exists: false } },
      ],
    },
    sort: '-createdAt',
    page,
    limit,
    depth: 2,
    // Signed-out readers get the public constraint inline — passing it
    // explicitly (rather than via overrideAccess) avoids the nested-path
    // permission check that rejects author.isPrivate for anonymous requests.
    ...(user ? { user, overrideAccess: false as const } : {}),
  })

  return { items: await hydratePosts(result.docs, user), hasMore: result.hasNextPage }
}

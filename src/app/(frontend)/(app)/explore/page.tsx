import { getHangoutPresence } from '@/actions/hangouts'
import {
  type CategorySpotlight,
  getCategorySpotlights,
  getHotDiscussions,
  getTrendingTags,
  getUnansweredTanong,
  searchPosts,
} from '@/actions/posts'
import { searchUsers } from '@/actions/users'
import { ExploreSearch } from '@/components/ExploreSearch'
import type { PostCardData } from '@/lib/serialize'
import { EXPLORE_TABS, type ExploreTab } from '@/lib/tabs'

export const metadata = { title: 'Explore' }

const EMPTY_POSTS: Promise<PostCardData[]> = Promise.resolve([])
const EMPTY_SPOTLIGHTS: Promise<CategorySpotlight[]> = Promise.resolve([])

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>
}) {
  const { q: rawQ, tab: rawTab } = await searchParams
  const q = rawQ?.trim() ?? ''
  // ?tab= persists the For You / Hangouts selection across refreshes.
  const initialTab: ExploreTab | undefined = (EXPLORE_TABS as readonly string[]).includes(
    rawTab ?? '',
  )
    ? (rawTab as ExploreTab)
    : undefined
  // Discovery sections only exist for the unqueried state — skip the fetches
  // entirely while searching.
  const [users, posts, trendingTags, hotDiscussions, unanswered, spotlights, hangoutPresence] =
    await Promise.all([
      searchUsers(q),
      searchPosts(q),
      getTrendingTags(),
      q ? EMPTY_POSTS : getHotDiscussions(),
      q ? EMPTY_POSTS : getUnansweredTanong(),
      q ? EMPTY_SPOTLIGHTS : getCategorySpotlights(),
      getHangoutPresence(),
    ])

  return (
    <ExploreSearch
      key={q}
      initialQuery={q}
      trendingTags={trendingTags}
      hotDiscussions={hotDiscussions}
      unansweredPosts={unanswered}
      spotlights={spotlights}
      initialUsers={users.items}
      initialUsersHasMore={users.hasMore}
      initialPosts={posts.items}
      initialPostsHasMore={posts.hasMore}
      hangoutPresence={hangoutPresence}
      initialTab={initialTab}
    />
  )
}

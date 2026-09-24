import { getTrendingTags, searchPosts } from '@/actions/posts'
import { searchUsers } from '@/actions/users'
import { ExploreSearch } from '@/components/ExploreSearch'

export const metadata = { title: 'Explore' }

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const q = (await searchParams).q?.trim() ?? ''
  const [users, posts, trendingTags] = await Promise.all([
    searchUsers(q),
    searchPosts(q),
    getTrendingTags(),
  ])

  return (
    <ExploreSearch
      key={q}
      initialQuery={q}
      trendingTags={trendingTags}
      initialUsers={users.items}
      initialUsersHasMore={users.hasMore}
      initialPosts={posts.items}
      initialPostsHasMore={posts.hasMore}
    />
  )
}

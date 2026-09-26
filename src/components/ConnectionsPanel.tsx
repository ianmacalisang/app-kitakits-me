'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { getFollowList } from '@/actions/follows'
import type { UserCardData } from '@/lib/serialize'

import { CountBadge } from './CountBadge'
import { EmptyState } from './EmptyState'
import { SearchIcon, UsersIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { Spinner } from './Spinner'
import { UserCoverCard } from './UserCoverCard'

type Kind = 'followers' | 'following'

const SEARCH_DEBOUNCE_MS = 300

// Followers / Following sub-tabs inside the profile Connections tab.
export function ConnectionsPanel({
  userId,
  followerCount,
  followingCount,
  isPublicPage = false,
}: {
  userId: number
  followerCount: number
  followingCount: number
  isPublicPage?: boolean
}) {
  const [kind, setKind] = useState<Kind>('followers')
  // Lists mount lazily on first visit, then stay mounted (hidden) so tab
  // switches don't lose scroll position or refetch.
  const [visited, setVisited] = useState<ReadonlySet<Kind>>(() => new Set(['followers']))
  const [query, setQuery] = useState('')

  const select = (next: Kind) => {
    setKind(next)
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
  }

  const counts: Record<Kind, number> = { followers: followerCount, following: followingCount }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex border-b border-black/5">
        {(['followers', 'following'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => select(value)}
            className={`-mb-px flex flex-1 items-center justify-center border-b-2 px-2 pb-2.5 pt-1 text-sm font-medium capitalize transition-colors ${
              kind === value
                ? 'border-accent-600 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {value}
            <CountBadge count={counts[value]} showZero />
          </button>
        ))}
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${kind}…`}
          aria-label={`Search ${kind}`}
          autoComplete="off"
          className="glass-input h-10 rounded-full py-0 pl-10 pr-4 text-sm"
        />
      </div>

      {(['followers', 'following'] as const).map(
        (value) =>
          visited.has(value) && (
            <div key={value} className={kind === value ? '' : 'hidden'}>
              <FollowList userId={userId} kind={value} query={query} isPublicPage={isPublicPage} />
            </div>
          ),
      )}
    </div>
  )
}

function FollowList({
  userId,
  kind,
  query,
  isPublicPage,
}: {
  userId: number
  kind: Kind
  query: string
  isPublicPage: boolean
}) {
  const [users, setUsers] = useState<UserCardData[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [pending, startTransition] = useTransition()

  // Debounce the raw input so each keystroke doesn't fire a server action.
  const [search, setSearch] = useState(query.trim())
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // Which search the rendered list was fetched for — a mismatch means a
  // refresh is in flight, so the stale list stays visible but dimmed.
  const [loadedSearch, setLoadedSearch] = useState(search)
  const refreshing = users === null || loadedSearch !== search

  useEffect(() => {
    let cancelled = false
    void getFollowList(userId, kind, 1, search || undefined).then((result) => {
      if (cancelled) return
      setUsers(result.items)
      setHasMore(result.hasMore)
      setPage(1)
      setLoadedSearch(search)
    })
    return () => {
      cancelled = true
    }
  }, [userId, kind, search])

  const searchRef = useRef(search)
  useEffect(() => {
    searchRef.current = search
  }, [search])

  const loadMore = useCallback(() => {
    if (pending || refreshing) return
    const atSearch = search
    startTransition(async () => {
      const next = page + 1
      const result = await getFollowList(userId, kind, next, atSearch || undefined)
      // Stale page — the search changed mid-flight and the refresh effect
      // already replaced the list.
      if (searchRef.current !== atSearch) return
      setUsers((prev) => {
        const seen = new Set((prev ?? []).map((u) => u.id))
        return [...(prev ?? []), ...result.items.filter((u) => !seen.has(u.id))]
      })
      setHasMore(result.hasMore)
      setPage(next)
    })
  }, [pending, refreshing, page, userId, kind, search])

  if (users === null) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <EmptyState
        icon={search ? <SearchIcon /> : <UsersIcon />}
        title={
          search
            ? 'No matches'
            : kind === 'followers'
              ? 'No followers yet'
              : 'Not following anyone yet'
        }
        message={
          search
            ? `No ${kind} match “${search}”.`
            : kind === 'followers'
              ? 'New followers will show up here.'
              : 'Followed accounts will show up here.'
        }
      />
    )
  }

  return (
    <>
      <ul
        className={`grid grid-cols-1 gap-3 transition-opacity lg:grid-cols-2 ${
          refreshing ? 'opacity-50' : ''
        }`}
      >
        {users.map((person) => (
          <UserCoverCard key={person.id} user={person} isPublicPage={isPublicPage} />
        ))}
      </ul>
      <LoadSentinel hasMore={hasMore && !refreshing} pending={pending} onLoadAction={loadMore} />
    </>
  )
}

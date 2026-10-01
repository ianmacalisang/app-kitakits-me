'use client'

import { useCallback, useEffect, useState } from 'react'

// Syncs a segmented-control tab with the ?tab= URL param: selections survive
// refreshes and shared links, and back/forward navigation restores them.
// Selecting the default tab drops the param so URLs stay clean.
//
// `initialTab` is the server-validated ?tab= value — pages read their
// searchParams and pass it down so the first paint already shows the right
// tab. The hook validates against `validTabs` on every read anyway.
export function useUrlTab<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
  initialTab?: T,
  param = 'tab',
): [T, (next: T) => void] {
  const resolve = useCallback(
    (raw: string | null | undefined): T =>
      raw != null && validTabs.includes(raw as T) ? (raw as T) : defaultTab,
    [validTabs, defaultTab],
  )

  const [tab, setTab] = useState<T>(() => resolve(initialTab))

  // Same-page soft navigations keep client state but deliver a new
  // searchParams-derived prop — adopt it so the URL stays the source of truth.
  const [prevInitial, setPrevInitial] = useState(initialTab)
  if (initialTab !== prevInitial) {
    setPrevInitial(initialTab)
    setTab(resolve(initialTab))
  }

  // Back/forward across history entries the router didn't mediate.
  useEffect(() => {
    const sync = () => setTab(resolve(new URLSearchParams(window.location.search).get(param)))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [resolve, param])

  // Matches the media/category filters in Feed — replaceState so tab clicks
  // don't pile up history entries, and sibling params are preserved.
  const select = useCallback(
    (next: T) => {
      setTab(next)
      const params = new URLSearchParams(window.location.search)
      if (next === defaultTab) params.delete(param)
      else params.set(param, next)
      const query = params.toString()
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      )
    },
    [defaultTab, param],
  )

  return [tab, select]
}

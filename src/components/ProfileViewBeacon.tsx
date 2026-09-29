'use client'

import { useEffect, useRef } from 'react'

import { recordProfileView } from '@/actions/profileViews'

// Fires the view recording once per mount. Client-side on purpose — a
// server-side write during render would also record Next.js <Link>
// prefetches that never become real visits. The ref absorbs strict-mode's
// double effect invocation in dev.
export function ProfileViewBeacon({ viewedId }: { viewedId: number }) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    void recordProfileView(viewedId)
  }, [viewedId])

  return null
}

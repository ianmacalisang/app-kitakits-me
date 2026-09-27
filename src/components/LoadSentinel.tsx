import { useEffect, useRef } from 'react'

import { Spinner } from './Spinner'

// IntersectionObserver sentinel — calls onLoad when it scrolls near the
// viewport so lists can append the next page continuously.
export function LoadSentinel({
  hasMore,
  pending,
  onLoadAction,
  rootMargin = '600px 0px',
}: {
  hasMore: boolean
  pending: boolean
  onLoadAction: () => void
  /** Sideways expansion for sentinels inside horizontal scroll rails. */
  rootMargin?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onLoadRef = useRef(onLoadAction)

  useEffect(() => {
    onLoadRef.current = onLoadAction
  }, [onLoadAction])

  useEffect(() => {
    const el = ref.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadRef.current()
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // Re-observe when a load finishes — if the sentinel never left the
    // viewport the observer won't fire again on its own.
  }, [hasMore, pending, rootMargin])

  if (!hasMore) return null

  return (
    <div ref={ref} className="flex justify-center py-4">
      {pending && <Spinner className="h-5 w-5" />}
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'

// "Go back" for error and 404 surfaces — falls back to `fallback` when the
// visitor landed directly and there is no history entry to return to.
export function GoBackButton({
  fallback = '/',
  className = '',
  children = 'Go back',
}: {
  fallback?: string
  className?: string
  children?: React.ReactNode
}) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={className}
    >
      {children}
    </button>
  )
}

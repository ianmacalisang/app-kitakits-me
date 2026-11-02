import Link from 'next/link'
import type { ReactNode } from 'react'

// Wraps hangout-room avatars in a profile link — heads without a username
// (the unresolved-relationship fallback) render as a plain span instead.
export function ProfileLink({
  username,
  className,
  children,
}: {
  username: string | null | undefined
  className?: string
  children: ReactNode
}) {
  if (!username) return <span className={className}>{children}</span>
  return (
    <Link href={`/profile/${username}`} className={className}>
      {children}
    </Link>
  )
}

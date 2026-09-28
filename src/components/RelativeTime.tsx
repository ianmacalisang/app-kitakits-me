import { formatRelativeTime } from '@/lib/time'

// Relative timestamps are nondeterministic across SSR → hydration because
// Date.now() advances between the two renders ("3m" server vs "4m" client),
// which trips React's hydration text-mismatch check. Rendering through this
// wrapper suppresses the diff so React keeps the server-rendered label
// instead of regenerating the tree. Always render formatRelativeTime output
// through this component — never inline it in SSR'd JSX.
export function RelativeTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {formatRelativeTime(iso)}
    </time>
  )
}

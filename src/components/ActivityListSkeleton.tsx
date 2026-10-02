// Skeleton for the Activities tab — day-label headers over timeline rows: a
// node dot on the rail, avatar, and text bars, matching ActivityItem's shape.
export function ActivityListSkeleton() {
  const groups = [
    { label: 'w-16', rows: 4 },
    { label: 'w-24', rows: 3 },
  ]
  return (
    <div aria-hidden className="flex flex-col gap-5">
      {groups.map((group, gi) => (
        <section key={gi}>
          <div className="mb-2 flex items-center gap-2.5">
            <span className={`h-2.5 animate-pulse rounded-full bg-neutral-200/70 ${group.label}`} />
            <span className="h-px flex-1 bg-black/5" />
          </div>
          <ul>
            {Array.from({ length: group.rows }).map((_, i) => (
              <li key={i} className="flex">
                {/* Timeline rail — the node dot sits at the avatar's center. */}
                <span className="relative w-8 shrink-0">
                  <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-neutral-300/60" />
                  <span className="absolute left-1/2 top-[22px] h-6 w-6 -translate-x-1/2 animate-pulse rounded-full bg-neutral-200/80 ring-[3px] ring-white/80" />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2">
                  <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-neutral-200/70" />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block h-3 animate-pulse rounded-full bg-neutral-200/70"
                      style={{ width: `${68 - ((i + gi) % 3) * 14}%` }}
                    />
                    <span className="mt-1.5 block h-2.5 w-24 animate-pulse rounded-full bg-neutral-200/50" />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

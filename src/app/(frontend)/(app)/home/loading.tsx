export default function Loading() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="glass animate-pulse rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-accent-900/10" />
            <div className="space-y-2">
              <div className="h-3 w-32 rounded-full bg-accent-900/10" />
              <div className="h-2.5 w-20 rounded-full bg-accent-900/10" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded-full bg-accent-900/10" />
            <div className="h-3 w-2/3 rounded-full bg-accent-900/10" />
          </div>
        </div>
      ))}
    </div>
  )
}

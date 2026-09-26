// Small count pill for tab bars — replaces "(12)" suffixes. onAccent keeps it
// legible when the tab sits on the gradient thumb (white text).
export function CountBadge({
  count,
  onAccent = false,
  showZero = false,
}: {
  count: number
  onAccent?: boolean
  showZero?: boolean
}) {
  if (!showZero && count <= 0) return null
  return (
    <span
      className={`ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
        onAccent ? 'bg-white/25 text-white' : 'bg-accent-500/15 text-accent-700'
      }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

import type { ReactNode } from 'react'

// Shared empty-state layout — a soft icon disc over a bold title and muted
// description, on a glass card by default. `plain` drops the card for spots
// that already sit on a surface (sheets, dropdowns, inside post cards);
// `compact` tightens it for smaller areas.
// `icon` takes an element (not a component type) so the prop stays
// serializable when passed to client components.
export function EmptyState({
  icon,
  title,
  message,
  children,
  compact = false,
  plain = false,
  className = '',
}: {
  icon?: ReactNode
  title: ReactNode
  message?: ReactNode
  children?: ReactNode
  compact?: boolean
  plain?: boolean
  className?: string
}) {
  return (
    <div
      className={[
        'flex flex-col items-center text-center',
        plain ? 'gap-2.5 px-4' : 'glass gap-3 rounded-3xl px-6',
        compact ? 'py-8' : plain ? 'py-10' : 'py-10',
        className,
      ].join(' ')}
    >
      {icon && (
        <span
          className={`flex items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 [&_svg]:shrink-0 ${
            compact ? 'h-10 w-10 [&_svg]:h-5 [&_svg]:w-5' : 'h-14 w-14 [&_svg]:h-7 [&_svg]:w-7'
          }`}
        >
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-neutral-700">{title}</p>
        {message && <p className="max-w-xs text-xs leading-relaxed text-neutral-500">{message}</p>}
      </div>
      {children}
    </div>
  )
}

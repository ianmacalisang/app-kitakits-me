import { memo } from 'react'

import { toCdnUrl } from '@/lib/cdn'

import { BlurImage } from './BlurImage'

const sizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
  xl: 'h-24 w-24 text-3xl',
  '2xl': 'h-28 w-28 text-4xl',
}

// Empty-avatar palette — a name's hash picks a stable hue so each user gets
// a consistent color. Full class strings stay literal for Tailwind.
const COLORS = [
  'bg-amber-500 text-white',
  'bg-orange-500 text-white',
  'bg-rose-500 text-white',
  'bg-fuchsia-500 text-white',
  'bg-violet-500 text-white',
  'bg-sky-500 text-white',
  'bg-emerald-500 text-white',
  'bg-teal-500 text-white',
]

export const Avatar = memo(function Avatar({
  src,
  name,
  size = 'md',
}: {
  src?: string | null
  name: string
  size?: keyof typeof sizes
}) {
  const url = toCdnUrl(src)
  const classes = `${sizes[size]} shrink-0 rounded-full bg-accent-100/80 object-cover ring-1 ring-accent-900/10`

  if (url) {
    return <BlurImage src={url} alt={name} className={classes} />
  }

  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0

  return (
    <div
      className={`${sizes[size]} shrink-0 rounded-full ring-1 ring-accent-900/10 flex items-center justify-center font-semibold ${COLORS[Math.abs(hash) % COLORS.length]}`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
})

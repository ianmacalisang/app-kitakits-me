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

  return (
    <div
      className={`${classes} flex items-center justify-center font-semibold text-accent-700`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
})

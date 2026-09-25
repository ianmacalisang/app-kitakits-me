'use client'

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Layout effects warn during SSR; fall back to a plain effect on the server.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// Blur-in image — starts blurred, then eases to sharp once loaded so images
// don't pop in abruptly. The effect lives in inline styles so it works
// regardless of which transition-* utilities the caller applies.
export const BlurImage = memo(function BlurImage({
  className,
  style,
  onLoad,
  alt = '',
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null)
  // undefined = not yet checked (renders sharp, matching SSR markup). A layout
  // effect resolves it before paint so cached images skip the blur entirely.
  const [loaded, setLoaded] = useState<boolean>()

  useIsomorphicLayoutEffect(() => {
    setLoaded(Boolean(ref.current?.complete && ref.current.naturalWidth > 0))
  }, [])

  const blurring = loaded === false

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={ref}
      alt={alt}
      onLoad={(e) => {
        setLoaded(true)
        onLoad?.(e)
      }}
      className={className}
      style={{
        filter: blurring ? 'blur(16px)' : 'blur(0px)',
        transition: 'filter 0.45s ease-out',
        ...style,
      }}
    />
  )
})

'use client'

import { useEffect, useRef, useState } from 'react'

// Marks itself with `data-inview` while on screen — globals.css parks all
// descendant animations until the attribute appears (and pauses them again
// when it scrolls away).
export function InView({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // threshold 0 + a slight bottom inset: fires as soon as any part of the
    // element scrolls into the lower viewport — 0.25 would never trip for
    // containers taller than ~4x the viewport (e.g. the post masonry).
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
      rootMargin: '0px 0px -8% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      data-inview-root
      data-inview={inView || undefined}
      className={className}
      {...rest}
    >
      {children}
    </div>
  )
}

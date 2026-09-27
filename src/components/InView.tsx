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
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.25,
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

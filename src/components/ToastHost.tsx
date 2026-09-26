'use client'

import { useEffect, useState } from 'react'

import { TOAST_EVENT } from '@/lib/events'

import { CheckIcon } from './icons'

const TOAST_MS = 3000

interface ToastItem {
  id: number
  message: string
}

let nextId = 0

// Toast host — renders short-lived confirmation pills above the dock.
// Mounted once in the app layout; fire with `toast('…')` from lib/events.
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (event: Event) => {
      const { message } = (event as CustomEvent<{ message: string }>).detail
      const id = ++nextId
      setItems((prev) => [...prev.slice(-2), { id, message }])
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), TOAST_MS)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [])

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="glass motion-safe:animate-toast-in flex items-center gap-2 rounded-full py-2 pl-2.5 pr-4 text-sm font-medium shadow-lg"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-500/15 text-accent-600">
            <CheckIcon className="h-3 w-3" />
          </span>
          {t.message}
        </div>
      ))}
    </div>
  )
}

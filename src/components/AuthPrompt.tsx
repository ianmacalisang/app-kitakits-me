'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { BrandMark } from './Branding'

const CLOSE_MS = 300

// Login gate for signed-out interactions — like, repost, comment.
export function AuthPrompt({ open, onCloseAction }: { open: boolean; onCloseAction: () => void }) {
  const [closing, setClosing] = useState(false)

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      onCloseAction()
      setClosing(false)
    }, CLOSE_MS)
  }, [closing, onCloseAction])

  // Lock scroll and support Escape while the dialog is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
          closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
        }`}
        onClick={close}
      />
      <div
        role="alertdialog"
        aria-label="Log in to continue"
        className={`glass relative flex w-full max-w-sm flex-col rounded-t-[28px] p-6 sm:rounded-[28px] ${
          closing
            ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
            : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" />

        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size="md" />
          <h2 className="text-[15px] font-semibold">Log in to continue</h2>
          <p className="text-sm text-neutral-500">
            Log in or create an account to like, repost, and comment.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Link href="/login" className="btn-primary rounded-xl py-2.5 text-center text-sm">
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-xl bg-black/5 py-2.5 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-black/10"
          >
            Create account
          </Link>
          <button
            type="button"
            onClick={close}
            className="py-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

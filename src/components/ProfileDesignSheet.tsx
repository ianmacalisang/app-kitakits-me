'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type {
  ProfileAccent,
  ProfileCardStyle,
  ProfileFont,
  ProfileLayout,
  ProfileTheme,
} from '@/lib/profileDesign'

import { ChevronRightIcon, PaletteIcon } from './icons'
import { ProfileDesignForm, type DesignPreviewData } from './ProfileDesignForm'
import { useSheetDragClose } from './useSheetDrag'

const CLOSE_MS = 300

// "Change your profile design" entry point on the owner's profile page —
// opens a sheet for layout/background/accent controls used by both the
// public /@username page and the in-app profile page.
export function ProfileDesignSheet({
  username,
  publicProfile,
  initial,
  preview,
}: {
  username: string
  publicProfile: boolean
  initial: {
    layout: ProfileLayout
    accent: ProfileAccent
    cardStyle: ProfileCardStyle
    theme: ProfileTheme
    font: ProfileFont
    backgroundUrl?: string
  }
  preview: DesignPreviewData
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, CLOSE_MS)
  }, [closing])

  const sheetDrag = useSheetDragClose(close)

  // Lock scroll and support Escape while the sheet is open.
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass group flex w-full items-center gap-3.5 rounded-3xl p-4 text-left transition hover:shadow-md"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-600 transition group-hover:bg-accent-500/15">
          <PaletteIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Change your profile design</span>
          <span className="block truncate text-xs text-neutral-500">
            Layout, theme, fonts &amp; colors for /@{username}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5" />
      </button>

      {/* Sheet — portaled so glass card backdrop-filters can't trap it */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
            <div
              className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
                closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
              }`}
            />
            <div
              {...sheetDrag}
              className={`glass relative flex h-dvh w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:h-auto sm:max-h-[85vh] sm:rounded-[28px] ${
                closing
                  ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
                  : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
              }`}
            >
              {/* iOS sheet drag handle (mobile) */}
              <div
                data-sheet-handle
                className="mx-auto mb-1 mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
              />

              {/* Header: Cancel / title / spacer */}
              <div
                data-sheet-handle
                className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 pb-3 pt-1 sm:pt-3"
              >
                <button
                  type="button"
                  onClick={close}
                  className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800"
                >
                  Cancel
                </button>
                <h2 className="text-[15px] font-semibold">Public profile design</h2>
                <span className="w-14" />
              </div>

              <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-none p-5">
                <ProfileDesignForm
                  publicProfile={publicProfile}
                  initial={initial}
                  preview={preview}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

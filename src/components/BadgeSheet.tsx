'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { getUserBadges } from '@/actions/gamification'
import type { ActivityData, BadgeProgressData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BADGE_ICON_COMPONENTS, BADGE_TIER_STYLES } from './BadgeShelf'
import { EmptyState } from './EmptyState'
import { MedalIcon, TrophyIcon } from './icons'
import { Spinner } from './Spinner'
import { useSheetDragClose } from './useSheetDrag'

const CLOSE_MS = 300

const earnedLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null

// Controlled sheet listing a user's earned badges — opened from badge-earned
// activity rows. `activity` being non-null = open.
export function BadgeSheet({
  activity,
  onCloseAction,
}: {
  activity: ActivityData | null
  onCloseAction: () => void
}) {
  const [closing, setClosing] = useState(false)
  const [badges, setBadges] = useState<BadgeProgressData[] | null>(null)
  const [prevUser, setPrevUser] = useState<string | null>(null)

  // Reset the cache when the sheet opens for a different user — adjusting
  // state during render is the React-sanctioned alternative to a reset
  // effect, and the refetch effect below fires off the null.
  if (activity && prevUser !== activity.actorUsername) {
    setPrevUser(activity.actorUsername)
    setBadges(null)
  }

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      onCloseAction()
      setClosing(false)
    }, CLOSE_MS)
  }, [closing, onCloseAction])

  const sheetDrag = useSheetDragClose(close)

  // Fetch the actor's badges once the sheet is open and the cache is empty.
  useEffect(() => {
    if (!activity || badges !== null) return
    let cancelled = false
    void getUserBadges(activity.actorUsername).then((result) => {
      if (!cancelled) setBadges(result)
    })
    return () => {
      cancelled = true
    }
  }, [activity, badges])

  // Lock scroll and support Escape while the sheet is open.
  useEffect(() => {
    if (!activity) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [activity, close])

  if (!activity) return null

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
          closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
        }`}
        onClick={close}
      />
      <div
        {...sheetDrag}
        className={`glass relative flex h-dvh w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:h-auto sm:max-h-[85vh] sm:rounded-[28px] ${
          closing
            ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
            : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
        }`}
      >
        <div
          data-sheet-handle
          className="mx-auto mb-1 mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
        />

        <div
          data-sheet-handle
          className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 pb-3 pt-1 sm:pt-3"
        >
          <button
            type="button"
            onClick={close}
            className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800"
          >
            Close
          </button>
          <h2 className="text-[15px] font-semibold">Badges</h2>
          <span className="w-14" />
        </div>

        <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-none p-5">
          {/* Actor identity — whose achievements these are */}
          <div className="mb-4 flex items-center gap-3">
            <Avatar src={activity.actorAvatarUrl} name={activity.actorName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {activity.actorName}{' '}
                <span className="font-normal text-neutral-500">@{activity.actorUsername}</span>
              </p>
              {activity.badgeEarned && (
                <p className="truncate text-xs text-neutral-500">
                  just earned {activity.badgeEarned.name}
                </p>
              )}
            </div>
          </div>

          {badges === null ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : badges.length === 0 ? (
            <EmptyState
              plain
              icon={<TrophyIcon />}
              title="No badges yet"
              message="Badges are earned by posting, commenting, and connecting."
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {badges.map((badge) => {
                const Icon =
                  BADGE_ICON_COMPONENTS[badge.icon as keyof typeof BADGE_ICON_COMPONENTS] ??
                  MedalIcon
                const earnedAt = earnedLabel(badge.awardedAt)
                const justEarned = badge.slug === activity.badgeEarned?.slug
                return (
                  <li
                    key={badge.slug}
                    title={badge.description ?? badge.name}
                    className={`flex items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3.5 ring-1 ${
                      justEarned
                        ? BADGE_TIER_STYLES[badge.tier].soft
                        : 'bg-white/70 ring-black/[0.06] dark:bg-white/[0.06] dark:ring-white/10'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${BADGE_TIER_STYLES[badge.tier].solid}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold leading-tight">
                        {badge.name}
                      </span>
                      <span
                        className={`block truncate text-[11px] font-medium capitalize leading-tight ${BADGE_TIER_STYLES[badge.tier].text}`}
                      >
                        {badge.tier}
                        {earnedAt ? ` · ${earnedAt}` : ''}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

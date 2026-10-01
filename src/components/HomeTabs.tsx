'use client'

import { Suspense, use, type ReactNode } from 'react'

import { HOME_TABS, type HomeTab } from '@/lib/tabs'

import { CountBadge } from './CountBadge'
import { HomeTabContext } from './HomeTabContext'
import { ActivityIcon, BookmarkIcon, HomeIcon } from './icons'
import { useUrlTab } from './useUrlTab'

type Tab = HomeTab

const TABS: { value: Tab; label: string; icon: typeof HomeIcon }[] = [
  { value: 'feed', label: 'Feed', icon: HomeIcon },
  { value: 'activities', label: 'Activities', icon: ActivityIcon },
  { value: 'saved', label: 'Saved', icon: BookmarkIcon },
]

const THUMB_POSITION: Record<Tab, string> = {
  feed: 'translate-x-0',
  activities: 'translate-x-full',
  saved: 'translate-x-[200%]',
}

// Reads the saves count via use() inside its own Suspense — the pill renders
// immediately and the badge pops in when the count query settles.
function SavedCountBadge({ count, onAccent }: { count: Promise<number>; onAccent: boolean }) {
  return <CountBadge count={use(count)} onAccent={onAccent} />
}

// Feed / Activities / Saved segmented control for the home page — a glass
// pill with a sliding gradient thumb. Panels arrive as server-rendered slots
// (each behind its own Suspense on the page) and stay mounted — hidden when
// inactive — so tab switches preserve scroll position and pagination state.
export function HomeTabs({
  mutualsRail,
  feedPanel,
  activitiesPanel,
  savedPanel,
  savedCount,
  initialTab,
}: {
  mutualsRail: ReactNode
  feedPanel: ReactNode
  activitiesPanel: ReactNode
  savedPanel: ReactNode
  savedCount: Promise<number>
  initialTab?: Tab
}) {
  // ?tab= persists the selection across refreshes and shares.
  const [tab, setTab] = useUrlTab(HOME_TABS, 'feed', initialTab)

  return (
    <section>
      {mutualsRail}
      <div role="tablist" aria-label="Home feed" className="mb-3">
        <div className="glass relative flex rounded-full p-1">
          {/* Sliding thumb — covers the active tab; with three equal tabs each
              full-width translate lands exactly on the next tab. */}
          <span
            aria-hidden
            className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-gradient-to-br from-accent-500 to-accent-600 shadow-md shadow-accent-600/30 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${THUMB_POSITION[tab]}`}
          />
          {TABS.map(({ value, label, icon: Icon }) => {
            const active = tab === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(value)}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-semibold transition-colors duration-300 active:scale-[0.98] ${
                  active ? 'text-white' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {value === 'saved' && (
                  <Suspense fallback={null}>
                    <SavedCountBadge count={savedCount} onAccent={active} />
                  </Suspense>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <HomeTabContext.Provider value={tab}>
        <div role="tabpanel" hidden={tab !== 'feed'}>
          {feedPanel}
        </div>
        <div role="tabpanel" hidden={tab !== 'activities'}>
          {activitiesPanel}
        </div>
        <div role="tabpanel" hidden={tab !== 'saved'}>
          {savedPanel}
        </div>
      </HomeTabContext.Provider>
    </section>
  )
}

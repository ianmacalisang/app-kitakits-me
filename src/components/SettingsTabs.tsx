'use client'

import type { ReactNode } from 'react'

import { SETTINGS_TABS, type SettingsTab } from '@/lib/tabs'

import { useUrlTab } from './useUrlTab'

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'account', label: 'Account & privacy' },
] as const

type Tab = SettingsTab

const THUMB_POSITION: Record<Tab, string> = {
  profile: 'translate-x-0',
  account: 'translate-x-full',
}

export function SettingsTabs({
  profile,
  account,
  initialTab,
}: {
  profile: ReactNode
  account: ReactNode
  initialTab?: Tab
}) {
  // ?tab= persists the selection across refreshes.
  const [tab, setTab] = useUrlTab(SETTINGS_TABS, 'profile', initialTab)
  const panels: Record<Tab, ReactNode> = { profile, account }

  return (
    <div>
      <div className="glass relative flex rounded-full p-1" role="tablist" aria-label="Settings">
        {/* Sliding gradient thumb — same pattern as HomeTabs / ProfileTabs */}
        <span
          aria-hidden
          className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-gradient-to-br from-accent-500 to-accent-600 shadow-md shadow-accent-600/30 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${THUMB_POSITION[tab]}`}
        />
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`settings-panel-${id}`}
            onClick={() => setTab(id)}
            className={`relative z-10 flex-1 rounded-full py-1.5 text-sm font-semibold transition-colors duration-300 ${
              tab === id ? 'text-white' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Panels stay mounted so form state survives tab switches */}
      {TABS.map(({ id }) => (
        <div
          key={id}
          role="tabpanel"
          id={`settings-panel-${id}`}
          aria-labelledby={`settings-tab-${id}`}
          hidden={tab !== id}
          className="mt-4 flex flex-col gap-3"
        >
          {panels[id]}
        </div>
      ))}
    </div>
  )
}

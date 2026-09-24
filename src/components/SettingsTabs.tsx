'use client'

import { useState, type ReactNode } from 'react'

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'account', label: 'Account & privacy' },
] as const

type Tab = (typeof TABS)[number]['id']

export function SettingsTabs({ profile, account }: { profile: ReactNode; account: ReactNode }) {
  const [tab, setTab] = useState<Tab>('profile')
  const panels: Record<Tab, ReactNode> = { profile, account }

  return (
    <div>
      <div className="glass flex rounded-full p-1" role="tablist" aria-label="Settings">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`settings-panel-${id}`}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-full py-1.5 text-sm font-medium transition-all ${
              tab === id
                ? 'bg-white/90 text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
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
          className="mt-5 flex flex-col gap-4"
        >
          {panels[id]}
        </div>
      ))}
    </div>
  )
}

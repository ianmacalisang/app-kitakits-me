'use client'

import { createContext } from 'react'

import type { HomeTab } from '@/lib/tabs'

// Which home tab is active. Panels reach HomeTabs as server-rendered slots, so
// client tab state can't reach them as a prop — context follows tree position
// and crosses the slot boundary, letting ActivitiesView refetch stale data
// when its panel becomes visible.
export const HomeTabContext = createContext<HomeTab>('feed')

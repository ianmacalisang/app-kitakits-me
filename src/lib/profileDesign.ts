import type { User } from '@/payload-types'

// Public-profile appearance options — kept in sync with the `profileLayout`
// and `profileAccent` select fields in collections/Users.ts. `swatch` is the
// 500-shade hex shown in the design sheet picker.
export type ProfileLayout = 'classic' | 'hero' | 'minimal'
export type ProfileAccent = 'default' | 'ocean' | 'emerald' | 'sunset' | 'berry' | 'gold'
export type ProfileCardStyle = 'glass' | 'solid'

export const PROFILE_LAYOUTS: { value: ProfileLayout; label: string; description: string }[] = [
  {
    value: 'classic',
    label: 'Classic',
    description: 'Cover banner with your avatar overlapping the edge.',
  },
  {
    value: 'hero',
    label: 'Hero',
    description: 'Your cover fills the whole card with your name on top.',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Centered avatar and info over your cover photo.',
  },
]

export const PROFILE_ACCENTS: { value: ProfileAccent; label: string; swatch: string }[] = [
  { value: 'default', label: 'Charcoal', swatch: '#404040' },
  { value: 'ocean', label: 'Ocean', swatch: 'oklch(68.5% 0.169 237.323)' },
  { value: 'emerald', label: 'Emerald', swatch: 'oklch(69.6% 0.17 162.48)' },
  { value: 'sunset', label: 'Sunset', swatch: 'oklch(70.5% 0.213 47.604)' },
  { value: 'berry', label: 'Berry', swatch: 'oklch(64.5% 0.246 16.439)' },
  { value: 'gold', label: 'Gold', swatch: 'oklch(76.9% 0.188 70.08)' },
]

export const PROFILE_CARD_STYLES: {
  value: ProfileCardStyle
  label: string
  description: string
}[] = [
  {
    value: 'glass',
    label: 'Frosted glass',
    description: 'Translucent cards that softly blur what’s behind them.',
  },
  {
    value: 'solid',
    label: 'Solid',
    description: 'Plain opaque cards — clean and flat.',
  },
]

const LAYOUTS: ProfileLayout[] = ['classic', 'hero', 'minimal']
const ACCENTS: ProfileAccent[] = ['default', 'ocean', 'emerald', 'sunset', 'berry', 'gold']
const CARD_STYLES: ProfileCardStyle[] = ['glass', 'solid']

export const isProfileLayout = (value: unknown): value is ProfileLayout =>
  LAYOUTS.includes(value as ProfileLayout)

export const isProfileAccent = (value: unknown): value is ProfileAccent =>
  ACCENTS.includes(value as ProfileAccent)

export const isProfileCardStyle = (value: unknown): value is ProfileCardStyle =>
  CARD_STYLES.includes(value as ProfileCardStyle)

export function profileLayoutValue(user: User): ProfileLayout {
  return isProfileLayout(user.profileLayout) ? user.profileLayout : 'classic'
}

export function profileAccentValue(user: User): ProfileAccent {
  return isProfileAccent(user.profileAccent) ? user.profileAccent : 'default'
}

export function profileCardStyleValue(user: User): ProfileCardStyle {
  return isProfileCardStyle(user.profileCardStyle) ? user.profileCardStyle : 'glass'
}

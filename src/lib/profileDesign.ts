import type { User } from '@/payload-types'

// Public-profile appearance options — kept in sync with the `profile*` select
// fields in collections/Users.ts. `swatch` is the 500-shade hex shown in the
// design sheet picker.
export type ProfileLayout = 'classic' | 'hero' | 'minimal'
export type ProfileAccent = 'default' | 'ocean' | 'emerald' | 'sunset' | 'berry' | 'gold'
export type ProfileCardStyle = 'glass' | 'solid'
export type ProfileTheme = 'light' | 'dark'
export type ProfileFont = 'default' | 'serif' | 'rounded' | 'modern' | 'mono' | 'handwritten'

export const PROFILE_THEMES: {
  value: ProfileTheme
  label: string
  description: string
}[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright & airy — the default look.',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Easy on the eyes, day or night.',
  },
]

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

// Font choices for the public page. The actual font-family stacks live in
// lib/profileFonts.ts (next/font instances); 'default' inherits the app's
// Poppins so it needs no override.
export const PROFILE_FONTS: {
  value: ProfileFont
  label: string
  description: string
}[] = [
  {
    value: 'default',
    label: 'Poppins',
    description: 'The default Kitakits look.',
  },
  {
    value: 'serif',
    label: 'Playfair',
    description: 'Elegant serif with an editorial feel.',
  },
  {
    value: 'rounded',
    label: 'Nunito',
    description: 'Soft, rounded and friendly.',
  },
  {
    value: 'modern',
    label: 'Space Grotesk',
    description: 'Geometric with a techy edge.',
  },
  {
    value: 'mono',
    label: 'JetBrains Mono',
    description: 'Monospace, typewriter energy.',
  },
  {
    value: 'handwritten',
    label: 'Caveat',
    description: 'Casual handwritten notes.',
  },
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
const THEMES: ProfileTheme[] = ['light', 'dark']
const FONTS: ProfileFont[] = ['default', 'serif', 'rounded', 'modern', 'mono', 'handwritten']

export const isProfileLayout = (value: unknown): value is ProfileLayout =>
  LAYOUTS.includes(value as ProfileLayout)

export const isProfileAccent = (value: unknown): value is ProfileAccent =>
  ACCENTS.includes(value as ProfileAccent)

export const isProfileCardStyle = (value: unknown): value is ProfileCardStyle =>
  CARD_STYLES.includes(value as ProfileCardStyle)

export const isProfileTheme = (value: unknown): value is ProfileTheme =>
  THEMES.includes(value as ProfileTheme)

export const isProfileFont = (value: unknown): value is ProfileFont =>
  FONTS.includes(value as ProfileFont)

export function profileLayoutValue(user: User): ProfileLayout {
  return isProfileLayout(user.profileLayout) ? user.profileLayout : 'classic'
}

export function profileAccentValue(user: User): ProfileAccent {
  return isProfileAccent(user.profileAccent) ? user.profileAccent : 'default'
}

export function profileCardStyleValue(user: User): ProfileCardStyle {
  return isProfileCardStyle(user.profileCardStyle) ? user.profileCardStyle : 'glass'
}

export function profileThemeValue(user: User): ProfileTheme {
  return isProfileTheme(user.profileTheme) ? user.profileTheme : 'light'
}

export function profileFontValue(user: User): ProfileFont {
  return isProfileFont(user.profileFont) ? user.profileFont : 'default'
}

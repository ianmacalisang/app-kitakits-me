import {
  Caveat,
  JetBrains_Mono,
  Nunito,
  Playfair_Display,
  Space_Grotesk,
} from 'next/font/google'

import type { ProfileFont } from './profileDesign'

// Optional public-profile fonts, loaded via next/font (self-hosted at build).
// 'default' inherits the app's Poppins, so it needs no override. Stacks append
// generic fallbacks; browsers only fetch a font file once rendered text
// actually resolves to it, so unused options cost nothing.
const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap' })
const nunito = Nunito({ subsets: ['latin'], display: 'swap' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], display: 'swap' })
const caveat = Caveat({ subsets: ['latin'], display: 'swap' })

export const PROFILE_FONT_FAMILIES: Record<ProfileFont, string | undefined> = {
  default: undefined,
  serif: `${playfair.style.fontFamily}, Georgia, serif`,
  rounded: `${nunito.style.fontFamily}, ui-rounded, system-ui, sans-serif`,
  modern: `${spaceGrotesk.style.fontFamily}, system-ui, sans-serif`,
  mono: `${jetbrainsMono.style.fontFamily}, ui-monospace, monospace`,
  handwritten: `${caveat.style.fontFamily}, cursive`,
}

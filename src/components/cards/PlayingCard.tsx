'use client'

import type { CSSProperties } from 'react'

import { UNGGOY_CARD, type CardCode } from '@/lib/unggoy'

// Face-up: rank + suit corner pip, big suit glyph in the middle, white stock
// with a soft inner shadow. Face-down: the accent-gradient back with a dotted
// linen pattern. Renders as a <button> when interactive so a tap on an
// opponent's fan draws that index. `dealStagger` delays the deal-in animation
// so a dealt hand cascades in order.
const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
const RED_SUITS = new Set(['H', 'D'])

const SIZES = {
  // Mini backs fanned under an opponent's name — tap targets when drawing.
  xs: 'h-10 w-7 rounded-md',
  // The viewer's own hand.
  md: 'h-20 w-14 rounded-lg',
  // The revealed unggoy at center table.
  lg: 'h-24 w-[4.25rem] rounded-xl',
} as const

export function PlayingCard({
  code,
  faceDown = false,
  size = 'md',
  onClick,
  highlight = false,
  style,
  dealStagger,
}: {
  code?: CardCode
  /** Face-down renders the back — `code` is ignored (hidden info). */
  faceDown?: boolean
  size?: keyof typeof SIZES
  onClick?: () => void
  /** Draw-source affordance — a lifted accent ring inviting the tap. */
  highlight?: boolean
  style?: CSSProperties
  /** Card index within a fresh deal — delays the entrance animation. */
  dealStagger?: number
}) {
  const isUnggoy = !faceDown && code === UNGGOY_CARD
  const shell = `relative shrink-0 select-none ${SIZES[size]} ${
    dealStagger !== undefined ? 'animate-card-deal' : ''
  } ${
    onClick
      ? `transition hover:-translate-y-1.5 ${highlight ? 'ring-2 ring-accent-400 shadow-lg shadow-accent-500/30' : 'ring-1 ring-white/25 hover:ring-accent-300'}`
      : isUnggoy
        ? 'ring-2 ring-amber-400/70 shadow-md shadow-amber-500/20'
        : 'ring-1 ring-black/15 shadow-md shadow-black/20'
  }`

  const mergedStyle: CSSProperties | undefined =
    dealStagger !== undefined ? { ...style, animationDelay: `${dealStagger * 45}ms` } : style

  const inner = faceDown ? (
    <span className="absolute inset-0 overflow-hidden rounded-[inherit] bg-gradient-to-br from-accent-500 via-accent-700 to-accent-950 ring-1 ring-inset ring-white/25">
      <span
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.4)_1px,transparent_1.5px)] bg-[size:6px_6px] opacity-50"
      />
      <span aria-hidden className="absolute inset-[3px] rounded-[inherit] border border-white/20" />
    </span>
  ) : (
    (() => {
      const rank = (code ?? '').slice(0, -1)
      const suit = (code ?? '').slice(-1)
      const red = RED_SUITS.has(suit)
      return (
        <span
          className={`absolute inset-0 flex flex-col overflow-hidden rounded-[inherit] bg-gradient-to-b from-white to-neutral-200 font-bold leading-none ${
            red ? 'text-rose-600' : 'text-neutral-800'
          }`}
        >
          <span className="flex flex-col items-start gap-px p-1 text-left text-[0.62em] sm:text-[0.7em]">
            <span>{rank}</span>
            <span>{SUIT_GLYPH[suit] ?? ''}</span>
          </span>
          <span className="flex flex-1 items-center justify-center text-[1.9em] drop-shadow-sm">
            {SUIT_GLYPH[suit] ?? ''}
          </span>
          {isUnggoy && (
            <span
              title="The unggoy — the card nobody wants"
              className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-400"
            />
          )}
        </span>
      )
    })()
  )

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={shell}
      style={mergedStyle}
      aria-label="Draw this card"
    >
      {inner}
    </button>
  ) : (
    <span className={shell} style={mergedStyle}>
      {inner}
    </span>
  )
}

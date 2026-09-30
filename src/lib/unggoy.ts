// Unggoy-Ungguyan — the Filipino Old Maid. A 49-card deck (standard 52 minus
// three queens) leaves Q♠ as the only unpairable card: "ang unggoy". Players
// discard pairs, then take turns drawing one face-down card from the previous
// player's hand; anyone who empties their hand is safe. The last player still
// holding cards is stuck with the monkey and loses.
//
// Pure functions only — no Payload imports — so the whole game is unit-
// testable. Hands are always kept pair-free: every mutation re-extracts.

export type CardCode = string // e.g. 'AS', '10H', 'QS'

export const UNGGOY_CARD: CardCode = 'QS'

const SUITS = ['S', 'H', 'D', 'C'] as const
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

export interface UnggoyState {
  /** User ids in seat order (clockwise). */
  seats: number[]
  /** Live hands keyed by user id — always pair-free. */
  hands: Record<number, CardCode[]>
  /** Index into seats of the player whose turn it is. */
  turnSeat: number
}

export interface DrawResult {
  state: UnggoyState
  /** The card that moved — needed by the drawer's own view, hidden elsewhere. */
  drawn: CardCode
  /** Whether the draw completed a pair (discarded immediately). */
  paired: boolean
  finished: boolean
  loserId: number | null
}

export const buildDeck = (): CardCode[] => {
  const deck: CardCode[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (rank === 'Q' && suit !== 'S') continue // queens out except the unggoy
      deck.push(`${rank}${suit}`)
    }
  }
  return deck
}

export const rankOf = (card: CardCode): string => card.slice(0, -1)

// Fisher–Yates with an injectable RNG so tests can pin the shuffle.
export const shuffled = <T>(items: T[], rng: () => number = Math.random): T[] => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Pull every pair (same rank) out of a hand, keeping at most one card per
// rank — the leftover single may pair later against a drawn card.
export const extractPairs = (cards: CardCode[]): { hand: CardCode[]; discarded: CardCode[] } => {
  const hand: CardCode[] = []
  const discarded: CardCode[] = []
  const seen = new Map<string, CardCode>()
  for (const card of cards) {
    const match = seen.get(rankOf(card))
    if (match !== undefined) {
      seen.delete(rankOf(card))
      discarded.push(match, card)
    } else {
      seen.set(rankOf(card), card)
    }
  }
  for (const card of cards) {
    const match = seen.get(rankOf(card))
    if (match === card) {
      hand.push(card)
      seen.delete(rankOf(card))
    }
  }
  return { hand, discarded }
}

// Shuffle, deal round-robin, drop everyone's dealt pairs. Seat order is
// already shuffled by the caller (fair first-move).
export const deal = (seats: number[], rng: () => number = Math.random): UnggoyState => {
  const deck = shuffled(buildDeck(), rng)
  const hands: Record<number, CardCode[]> = {}
  for (const id of seats) hands[id] = []
  deck.forEach((card, i) => hands[seats[i % seats.length]].push(card))
  for (const id of seats) hands[id] = extractPairs(hands[id]).hand
  return { seats: [...seats], hands, turnSeat: 0 }
}

const cardsOf = (state: UnggoyState, seatIndex: number): CardCode[] =>
  state.hands[state.seats[seatIndex]] ?? []

// Who the seatIndex player draws from: the previous seat, wrapping, that
// still holds cards (empty-handed players are safe and skip out).
export const drawSourceSeat = (state: UnggoyState, seatIndex: number): number | null => {
  for (let i = 1; i < state.seats.length; i++) {
    const idx = (seatIndex - i + state.seats.length) % state.seats.length
    if (cardsOf(state, idx).length > 0) return idx
  }
  return null
}

export const nextSeatWithCards = (state: UnggoyState, fromSeat: number): number | null => {
  for (let i = 1; i <= state.seats.length; i++) {
    const idx = (fromSeat + i) % state.seats.length
    if (cardsOf(state, idx).length > 0) return idx
  }
  return null
}

// Players still in the rotation — the game ends when only one remains.
export const seatsHoldingCards = (state: UnggoyState): number[] =>
  state.seats.map((_, i) => i).filter((i) => cardsOf(state, i).length > 0)

export const isFinished = (state: UnggoyState): boolean => seatsHoldingCards(state).length <= 1

export const loserId = (state: UnggoyState): number | null => {
  const remaining = seatsHoldingCards(state)
  return remaining.length === 1 ? state.seats[remaining[0]] : null
}

// The one move in the game: the seatIndex player takes the cardIndex-th card
// from the previous non-empty hand. Pairs extract, then the turn passes to
// the next player who still holds cards.
export const applyDraw = (
  state: UnggoyState,
  seatIndex: number,
  cardIndex: number,
): DrawResult | null => {
  if (seatIndex !== state.turnSeat) return null
  const sourceSeat = drawSourceSeat(state, seatIndex)
  if (sourceSeat === null) return null
  const sourceCards = cardsOf(state, sourceSeat)
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= sourceCards.length) {
    return null
  }

  const drawn = sourceCards[cardIndex]
  const hands: UnggoyState['hands'] = { ...state.hands }
  hands[state.seats[sourceSeat]] = sourceCards.filter((_, i) => i !== cardIndex)

  const drawerId = state.seats[seatIndex]
  const before = hands[drawerId].length
  const after = extractPairs([...hands[drawerId], drawn])
  hands[drawerId] = after.hand
  // Drawing a mate discards the pair: before + 1 drawn − 2 discarded.
  const paired = after.hand.length === before - 1

  const next: UnggoyState = { seats: [...state.seats], hands, turnSeat: seatIndex }
  if (!isFinished(next)) {
    next.turnSeat = nextSeatWithCards(next, seatIndex) ?? seatIndex
  }
  return {
    state: next,
    drawn,
    paired,
    finished: isFinished(next),
    loserId: isFinished(next) ? loserId(next) : null,
  }
}

// A member leaving mid-game: their pair-free hand is dealt round-robin into
// the hands that still hold cards (safe, empty-handed players have escaped
// the round and don't re-enter). If the leaver was the last holder their
// cards — including the unggoy — leave with them; the caller marks them the
// loser. The seat is removed and the turn pointer survives relative to its
// owner.
export const redistributeForLeave = (state: UnggoyState, userId: number): UnggoyState => {
  const seatIdx = state.seats.indexOf(userId)
  if (seatIdx === -1) return state
  const leaverCards = state.hands[userId] ?? []

  const seats = state.seats.filter((id) => id !== userId)
  const hands: UnggoyState['hands'] = { ...state.hands }
  delete hands[userId]
  if (seats.length === 0) return { seats, hands, turnSeat: 0 }

  const targets = seats.filter((id) => (hands[id] ?? []).length > 0)
  if (targets.length > 0) {
    leaverCards.forEach((card, i) => {
      const target = targets[i % targets.length]
      hands[target] = [...(hands[target] ?? []), card]
    })
  }
  for (const id of seats) hands[id] = extractPairs(hands[id] ?? []).hand

  // Map the old turn seat onto its owner; if the leaver held the turn, the
  // next seat index now points at whoever slid into their slot.
  const turnOwner = state.seats[state.turnSeat]
  let turnSeat =
    turnOwner === userId ? seatIdx % seats.length : Math.max(0, seats.indexOf(turnOwner))
  if (!cardsOf({ seats, hands, turnSeat }, turnSeat).length) {
    turnSeat = nextSeatWithCards({ seats, hands, turnSeat }, turnSeat) ?? 0
  }
  return { seats, hands, turnSeat }
}

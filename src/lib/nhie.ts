// Never Have I Ever — fingers-elimination party game. Everyone starts with
// START_FINGERS fingers; the seated players take turns supplying a prompt
// (drawn from the Taglish deck or written custom), and every active player
// answers "I have" / "Never". Each "I have" drops a finger once the whole
// circle has answered; players at zero are out and the last one with fingers
// up wins.
//
// Turn phases are derivable — no phase field needed:
//   prompt === null                    → the turn owner is picking a prompt
//   prompt set, circle not all answered → answering
//   prompt set, circle all answered     → resolved (fingers already applied)
//
// Pure functions only — no Payload imports — so the whole game is unit-
// testable.

export const START_FINGERS = 5
export const CUSTOM_PROMPT_MAX = 140

export type NhieAnswer = 'have' | 'never'

export interface NhiePrompt {
  text: string
  /** Seat owner who wrote it — null when drawn from the deck. */
  by: number | null
  source: 'deck' | 'custom'
}

export interface NhieState {
  /** User ids in seat order — turn rotation walks this list. */
  seats: number[]
  /** Fingers left per seated player — >0 means still in. */
  fingers: Record<number, number>
  /** Index into seats of the player whose prompt turn it is. */
  turnSeat: number
  prompt: NhiePrompt | null
  /** Answers to the current prompt, keyed by user id. */
  responses: Record<number, NhieAnswer>
  /** Indexes into NHIE_PROMPTS already used this game. */
  usedPrompts: number[]
}

export interface AnswerResult {
  state: NhieState
  /** This answer completed the circle — fingers were applied. */
  resolved: boolean
  /** User ids who lost a finger on resolve. */
  dropped: number[]
  finished: boolean
  winnerId: number | null
}

// Seat indexes whose owner still holds fingers — they answer prompts and
// stay in the turn rotation; everyone else is spectating the round.
export const activeSeats = (state: NhieState): number[] =>
  state.seats.map((_, i) => i).filter((i) => (state.fingers[state.seats[i]] ?? 0) > 0)

export const activeIds = (state: NhieState): number[] =>
  activeSeats(state).map((i) => state.seats[i])

export const allAnswered = (state: NhieState): boolean =>
  activeIds(state).every((id) => state.responses[id] !== undefined)

export const isFinished = (state: NhieState): boolean => activeSeats(state).length <= 1

export const winnerId = (state: NhieState): number | null => {
  const remaining = activeSeats(state)
  return remaining.length === 1 ? state.seats[remaining[0]] : null
}

// Fisher–Yates with an injectable RNG so tests can pin the shuffle.
export const shuffled = <T>(items: T[], rng: () => number = Math.random): T[] => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Seat order is already shuffled by the caller (fair first prompt).
export const dealGame = (seats: number[]): NhieState => {
  const fingers: Record<number, number> = {}
  for (const id of seats) fingers[id] = START_FINGERS
  return {
    seats: [...seats],
    fingers,
    turnSeat: 0,
    prompt: null,
    responses: {},
    usedPrompts: [],
  }
}

// Next seat index after fromSeat (wrapping) whose owner still has fingers.
export const nextActiveSeat = (state: NhieState, fromSeat: number): number | null => {
  for (let i = 1; i <= state.seats.length; i++) {
    const idx = (fromSeat + i) % state.seats.length
    if ((state.fingers[state.seats[idx]] ?? 0) > 0) return idx
  }
  return null
}

// Draw a deck prompt not yet used this game. An exhausted deck recycles —
// a 5-finger game ends long before ~50 prompts, so reuse is a corner case.
export const pickDeckPrompt = (
  state: NhieState,
  by: number | null,
  rng: () => number = Math.random,
): { state: NhieState; prompt: NhiePrompt } => {
  const used = new Set(state.usedPrompts)
  let pool = NHIE_PROMPTS.map((_, i) => i).filter((i) => !used.has(i))
  if (pool.length === 0) pool = NHIE_PROMPTS.map((_, i) => i)
  const idx = pool[Math.floor(rng() * pool.length)]
  const prompt: NhiePrompt = { text: NHIE_PROMPTS[idx], by, source: 'deck' }
  return {
    state: {
      ...state,
      prompt,
      responses: {},
      usedPrompts: [...state.usedPrompts, idx],
    },
    prompt,
  }
}

// The turn owner writes their own statement instead of drawing from the deck.
export const setCustomPrompt = (state: NhieState, text: string, by: number): NhieState => ({
  ...state,
  prompt: { text, by, source: 'custom' },
  responses: {},
})

// Everyone still holding fingers answers. The caller gates on phase — this
// rejects late/duplicate/out answers. When the last pending answer lands the
// circle resolves: every "I have" loses a finger and a lone survivor wins.
export const applyAnswer = (
  state: NhieState,
  userId: number,
  answer: NhieAnswer,
): AnswerResult | null => {
  if (!state.prompt) return null
  if (!activeIds(state).includes(userId)) return null
  if (state.responses[userId] !== undefined) return null

  const responses = { ...state.responses, [userId]: answer }
  const next: NhieState = { ...state, responses }
  let dropped: number[] = []

  if (allAnswered(next)) {
    const fingers = { ...next.fingers }
    dropped = activeIds(next).filter((id) => responses[id] === 'have')
    for (const id of dropped) fingers[id] = Math.max(0, (fingers[id] ?? 0) - 1)
    next.fingers = fingers
  }

  return {
    state: next,
    resolved: allAnswered(next),
    dropped,
    finished: isFinished(next),
    winnerId: isFinished(next) ? winnerId(next) : null,
  }
}

// The reveal is acknowledged — clear the prompt and hand the turn to the
// next player still in. Returns null while a circle is mid-answer or no
// prompt was ever set.
export const advanceTurn = (state: NhieState): NhieState | null => {
  if (!state.prompt || !allAnswered(state)) return null
  const turnSeat = nextActiveSeat(state, state.turnSeat) ?? state.turnSeat
  return { ...state, prompt: null, responses: {}, turnSeat }
}

// Host skips an idle turn — a prompt with answers is a live circle that
// resolves on its own, so skipping is only legal before anyone answers
// (for AFK answerers, removePlayer resolves the circle instead).
export const skipTurn = (state: NhieState): NhieState | null => {
  if (state.prompt && Object.keys(state.responses).length > 0) return null
  const turnSeat = nextActiveSeat(state, state.turnSeat)
  if (turnSeat === null || turnSeat === state.turnSeat) return null
  return { ...state, prompt: null, responses: {}, turnSeat }
}

// A member leaving mid-game: drop their seat, finger count, and pending
// answer. Removing the last pending answerer resolves the circle (fingers
// apply); the seat index is then remapped so the turn never lands on the
// leaver or a newly-eliminated player.
export const removePlayer = (
  state: NhieState,
  userId: number,
): { state: NhieState; resolved: boolean; dropped: number[] } => {
  const seatIdx = state.seats.indexOf(userId)
  if (seatIdx === -1) return { state, resolved: false, dropped: [] }

  const seats = state.seats.filter((id) => id !== userId)
  const fingers = { ...state.fingers }
  delete fingers[userId]
  const responses = { ...state.responses }
  delete responses[userId]

  // Keep turnSeat pointing at its occupant; if the leaver held the turn the
  // seat index now lands on whoever slid into the slot (or wraps).
  const turnOwner = state.seats[state.turnSeat]
  const turnSeat =
    turnOwner === userId
      ? seatIdx % Math.max(1, seats.length)
      : Math.max(0, seats.indexOf(turnOwner))

  let next: NhieState = {
    seats,
    fingers,
    turnSeat,
    prompt: state.prompt,
    responses,
    usedPrompts: state.usedPrompts,
  }

  // The leaver was holding up the reveal — resolve with the answers in hand.
  let dropped: number[] = []
  let resolved = false
  if (next.prompt && activeIds(next).length > 0 && allAnswered(next)) {
    const applied = { ...next.fingers }
    dropped = activeIds(next).filter((id) => next.responses[id] === 'have')
    for (const id of dropped) applied[id] = Math.max(0, (applied[id] ?? 0) - 1)
    next = { ...next, fingers: applied }
    resolved = true
  }

  // Turn seat must land on someone still in — hand it forward when the
  // remapped occupant is out (leaver held the turn, or resolution busted it).
  if (seats.length > 0 && (next.fingers[next.seats[next.turnSeat]] ?? 0) <= 0) {
    const active = nextActiveSeat(next, next.turnSeat)
    if (active !== null) next = { ...next, turnSeat: active }
  }

  return { state: next, resolved, dropped }
}

// The deck — "Never have I ever …" predicates, Taglish and Pinoy-flavored to
// match the app's voice. Keep additions PG-13: cheeky is fine, explicit isn't.
export const NHIE_PROMPTS = [
  'kumain ng balut',
  'sumakay ng jeepney habang umaandar pa ito',
  'nag-"Merry Christmas" sa kapitbahay para mamasko',
  'natulog sa klase',
  'nag-crush sa kaklase',
  'nag-text sa ex nang madaling araw',
  'nagpanggap na tulog para hindi pagutusan',
  'umiyak sa isang teleserye',
  'nag-videoke hanggang madaling araw',
  'nakalimutan ang birthday ng isang malapit na kaibigan',
  'nag-selos sa ex ng jowa ko',
  'kinain ang panghuling piraso ng ulam nang hindi nagpaalam',
  'nag-"one more song" sa videoke ng mahigit tatlong beses',
  'nag-ghost ng tao',
  'na-ghost ng tao',
  'sumali sa contest o pageant',
  'nakatulog sa sinehan',
  'naki-WiFi sa kapitbahay o sa kapit-establishment',
  'nag-order ng pagkain gamit ang ibang pangalan',
  'nakasakay ng tricycle na lampas sa kapasidad',
  'nag-Simbang Gabi — kahit hindi kumpleto',
  'nag-skip ng klase',
  'nagstay sa tambayan hanggang curfew',
  'nanligaw nang seryoso',
  'nagpadala ng flowers o nag-harana',
  'nagpaalam nang peke sa magulang',
  'nabuhay sa pancit canton nang ilang araw',
  'nag-double text',
  'nag-screenshot ng chat para i-send sa iba',
  'nag-parinig sa isang post',
  'napahiya sa harap ng crush',
  'nag-send ng maling message sa maling tao',
  'umamin sa crush ko',
  'nagdasal bago mag-exam',
  'kumain ng isaw, betamax, o adidas sa kanto',
  'umiyak dahil sa isang game',
  'nag-plan ng lakad na hindi natuloy',
  'nag-plano ng reunion para sa tropa',
  'nag-abot ng load sa crush',
  'nag-cheerleader o sumali sa field demo',
  'nag-grade ng sariling exam paper',
  'nakipag-videoke battle',
  'nag-picture sa beach o tourist spot para sa profile pic',
  'nag-selos sa best friend ng jowa ko',
  'nagtago ng pagkain para sa sarili',
  'nag-quota sa "seen" nang sadya',
  'nag-away sa comments section',
  'nag-marathon ng series nang isang tulog lang',
  'nagpa-tattoo o seryosong nagplano',
] as const

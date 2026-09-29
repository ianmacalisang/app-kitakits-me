// Progressive level table — `min` is total lifetime points. Kept in a pure
// module (no payload/db imports) so serialize.ts and client-rendered
// components can compute levels without pulling server-only deps.
const LEVELS = [
  { level: 1, name: 'Baguhan', min: 0 },
  { level: 2, name: 'Suki', min: 100 },
  { level: 3, name: 'Aktibo', min: 300 },
  { level: 4, name: 'Sikat', min: 700 },
  { level: 5, name: 'Icon', min: 1500 },
  { level: 6, name: 'Alamat', min: 3000 },
] as const

export interface LevelInfo {
  level: number
  name: string
  min: number
  // Points needed for the next level — null at the cap.
  nextAt: number | null
}

export const levelForPoints = (points: number): LevelInfo => {
  let current: LevelInfo = { ...LEVELS[0], nextAt: LEVELS[1]?.min ?? null }
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].min) {
      current = { ...LEVELS[i], nextAt: LEVELS[i + 1]?.min ?? null }
    }
  }
  return current
}

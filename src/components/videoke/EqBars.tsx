// Karaoke equalizer bars — the signature "live audio" cue across the
// videoke surfaces. `playing` toggles between the animated bounce and a
// static resting shape. Heights are fixed so bars never collapse to zero.
const HEIGHTS = [55, 100, 70, 90]
const DELAYS = [0, 0.18, 0.08, 0.26]
const DURATIONS = [0.8, 1.0, 0.7, 0.9]

export function EqBars({
  playing = true,
  className = '',
}: {
  playing?: boolean
  className?: string
}) {
  return (
    <span aria-hidden className={`flex items-end gap-[2.5px] ${className}`}>
      {HEIGHTS.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-current ${playing ? 'animate-eq' : ''}`}
          style={{
            height: `${h}%`,
            transformOrigin: 'bottom',
            animationDelay: `${DELAYS[i]}s`,
            animationDuration: `${DURATIONS[i]}s`,
          }}
        />
      ))}
    </span>
  )
}

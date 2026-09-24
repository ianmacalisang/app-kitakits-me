/** iOS-style activity indicator — 12 blades fading in sequence. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`relative ${className || 'h-7 w-7 text-neutral-500'}`}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="animate-spinner-blade absolute left-1/2 top-1/2 h-[26%] w-[7%] rounded-full bg-current"
          style={{
            transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-135%)`,
            animationDelay: `${(i * 1000) / 12 - 1000}ms`,
          }}
        />
      ))}
    </div>
  )
}

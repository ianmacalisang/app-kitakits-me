import { QuoteIcon } from './icons'

// Blockquote-style testimonial body — accent rule on the left, serif italic
// text, and a faint quote mark in the corner.
export function TestimonialQuote({ content }: { content: string }) {
  return (
    <blockquote className="relative pl-4">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-gradient-to-b from-accent-400 to-accent-500/30"
      />
      <QuoteIcon
        aria-hidden
        className="absolute -top-1 right-0 h-6 w-6 text-accent-500/15"
      />
      <p className="whitespace-pre-wrap font-serif text-[15px] italic leading-relaxed text-neutral-700">
        {content}
      </p>
    </blockquote>
  )
}

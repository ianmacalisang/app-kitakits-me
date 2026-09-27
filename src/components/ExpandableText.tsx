'use client'

import { useState } from 'react'

const CONTENT_PREVIEW_LEN = 300

// Collapses long text behind an inline "See more" toggle.
export function ExpandableText({ content, className }: { content: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > CONTENT_PREVIEW_LEN
  const shown =
    isLong && !expanded
      ? content
          .slice(0, CONTENT_PREVIEW_LEN)
          .replace(/\s+\S*$/, '')
          .trimEnd()
      : content

  return (
    <div className={className}>
      <p className="whitespace-pre-wrap leading-relaxed">
        {shown}
        {isLong && (
          <>
            {!expanded && '…'}{' '}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="font-medium text-accent-600 transition-colors hover:text-accent-700"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          </>
        )}
      </p>
    </div>
  )
}

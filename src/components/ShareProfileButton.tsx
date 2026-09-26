'use client'

import { useState } from 'react'

import { CheckIcon, ShareIcon } from './icons'

// Round share button for the public profile hero — uses the Web Share API on
// mobile and falls back to copying the profile URL with a brief tick state.
export function ShareProfileButton({ username, name }: { username: string; name: string }) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = `${window.location.origin}/@${username}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} (@${username})`, url })
      } catch {}
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? 'Profile link copied' : 'Share profile'}
      title={copied ? 'Copied!' : 'Share profile'}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/5 bg-white/60 text-neutral-500 transition-all duration-200 hover:border-accent-300/60 hover:bg-white/80 hover:text-accent-600 active:scale-95"
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-accent-600" />
      ) : (
        <ShareIcon className="h-4 w-4" />
      )}
    </button>
  )
}

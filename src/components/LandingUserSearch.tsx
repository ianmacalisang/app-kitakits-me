'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { searchPublicUsers } from '@/actions/users'
import type { UserCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { SearchIcon, UsersIcon, XIcon } from './icons'
import { Spinner } from './Spinner'

// Large public-profile search for the landing page hero. Same debounced
// combobox pattern as the in-app HeaderSearch, but backed by
// searchPublicUsers since visitors here aren't logged in — and results link
// to the public /@handle pages instead of /profile.
export function LandingUserSearch() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [results, setResults] = useState<UserCardData[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLFormElement>(null)

  // Close the autocomplete dropdown when clicking outside of it.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const go = (username: string) => {
    setOpen(false)
    router.push(`/@${username}`)
  }

  const submit = () => {
    const target = results[active] ?? results[0]
    if (target) go(target.username)
  }

  const handleChange = (next: string) => {
    setValue(next)
    setActive(-1)
    if (timer.current) clearTimeout(timer.current)
    const q = next.trim()
    if (!q) {
      setResults([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const items = await searchPublicUsers(q)
        setResults(items)
        setOpen(true)
      })
    }, 300)
  }

  const clear = () => {
    setValue('')
    setResults([])
    setOpen(false)
    if (timer.current) clearTimeout(timer.current)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(results[active].username)
    }
  }

  return (
    <form
      ref={boxRef}
      role="search"
      className="relative mx-auto w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <SearchIcon className="pointer-events-none absolute left-5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-neutral-400" />
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.trim() && results.length) setOpen(true)
        }}
        placeholder="Search for someone — a name or @handle"
        aria-label="Search public profiles"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="landing-search-results"
        aria-activedescendant={
          active >= 0 && results[active] ? `landing-search-option-${results[active].id}` : undefined
        }
        autoComplete="off"
        className="glass-input h-14 w-full rounded-full py-0 pl-13 pr-12 text-base shadow-lg shadow-accent-600/5"
      />
      <span className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center">
        {pending ? (
          <Spinner className="h-5 w-5 text-neutral-400" />
        ) : value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-300/80 text-white transition-colors hover:bg-neutral-400"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>

      {open && (
        <div
          id="landing-search-results"
          role="listbox"
          className="glass-pop motion-safe:animate-menu-pop absolute inset-x-0 top-full z-20 mt-2 origin-top rounded-2xl p-1.5 text-left"
        >
          {pending && results.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-4 w-4 text-neutral-400" />
            </div>
          ) : (
            <>
              {results.map((user, i) => (
                <button
                  key={user.id}
                  id={`landing-search-option-${user.id}`}
                  role="option"
                  aria-selected={active === i}
                  type="button"
                  onClick={() => go(user.username)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active === i ? 'bg-white/70' : 'hover:bg-white/70'
                  }`}
                >
                  <Avatar src={user.avatarUrl} name={user.name} size="md" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold leading-tight">
                      <span className="truncate">{user.name}</span>
                      <BadgeMark badge={user.topBadge} />
                    </span>
                    <span className="block truncate text-xs leading-tight text-neutral-500">
                      @{user.username} · {user.level.name}
                    </span>
                  </span>
                </button>
              ))}
              {results.length === 0 && (
                <div className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-500">
                  <UsersIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                  No public profiles found.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </form>
  )
}

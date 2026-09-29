'use client'

import { memo, useEffect, useRef, useState, useTransition } from 'react'

import { queueVideokeSong, searchVideokeSongs } from '@/actions/videoke'
import { toast } from '@/lib/events'
import type { VideokeRoomData } from '@/lib/videoke'
import type { YoutubeSong } from '@/lib/youtube'

import { Spinner } from '../Spinner'
import { MusicIcon, PlusIcon, SearchIcon } from '../icons'

export const fmtDuration = (sec: number | null) => {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Debounced YouTube search scoped to the karaoke channel — results queue
// straight into the room. Adding applies the returned room state so the
// queue updates without a refetch round-trip.
export const SongSearch = memo(function SongSearch({
  roomId,
  disabled,
  onRoom,
}: {
  roomId: number
  disabled?: boolean
  onRoom: (room: VideokeRoomData) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YoutubeSong[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [searching, startTransition] = useTransition()
  const seqRef = useRef(0)

  const onQuery = (v: string) => {
    setQuery(v)
    // Clearing happens in the handler (not the effect) so a backspaced query
    // drops stale results immediately.
    if (v.trim().length < 2) {
      seqRef.current += 1
      setResults([])
      setSearched(false)
      setError(null)
    }
  }

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const seq = ++seqRef.current
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await searchVideokeSongs(q)
        if (seq !== seqRef.current) return
        if (!res.ok) {
          setError(
            res.error === 'unavailable'
              ? 'Song search is not configured on this server.'
              : res.error,
          )
          setResults([])
          setSearched(true)
          return
        }
        setError(null)
        setResults(res.items)
        setSearched(true)
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [query])

  const add = (song: YoutubeSong) => {
    setAdding(song.videoId)
    startTransition(async () => {
      const res = await queueVideokeSong(roomId, song.videoId)
      setAdding(null)
      if (!res.ok) {
        toast(res.error)
        return
      }
      if (res.room) onRoom(res.room)
      setResults((prev) => prev.filter((s) => s.videoId !== song.videoId))
    })
  }

  const open = focused && (results.length > 0 || Boolean(error) || searched)

  return (
    // Focus/blur on the wrapper bubbles from the input AND the Queue buttons —
    // results only hide when focus truly leaves the whole control. The panel
    // is an overlay so it never pushes the player/queue down while typing.
    <div
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      {/* Dropdown anchors to the input row, not the caption below it */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-full bg-black/5 px-4 py-2.5 focus-within:ring-2 focus-within:ring-accent-500/40 dark:bg-white/10">
          <SearchIcon className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            disabled={disabled}
            placeholder="Search videoke songs…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400 disabled:opacity-60"
          />
          {searching && <Spinner className="h-4 w-4 shrink-0 text-neutral-400" />}
        </div>

        {open && (
          // preventDefault keeps taps on Queue from blurring the input first —
          // otherwise the list would unmount before the click lands (iOS).
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="glass-pop motion-safe:animate-menu-pop absolute inset-x-0 top-full z-20 mt-1.5 max-h-96 origin-top overflow-y-auto rounded-2xl p-1.5"
          >
            {error && <p className="px-2.5 py-2 text-xs text-neutral-500">{error}</p>}
            {!error && searched && results.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-neutral-500">
                No songs found — try another title.
              </p>
            )}
            {results.length > 0 && (
              <ul className="flex flex-col">
                {results.map((song) => (
                  <li
                    key={song.videoId}
                    className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    <span className="relative shrink-0">
                      {song.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={song.thumbnail}
                          alt=""
                          className="h-10 w-16 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-16 items-center justify-center rounded-lg bg-black/10 text-neutral-400 dark:bg-white/10">
                          <MusicIcon className="h-4 w-4" />
                        </span>
                      )}
                      {song.durationSec != null && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 py-px text-[9px] font-semibold leading-none text-white">
                          {fmtDuration(song.durationSec)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{song.title}</span>
                      {song.durationSec != null && (
                        <span className="text-xs text-neutral-500">
                          {fmtDuration(song.durationSec)}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={disabled || adding === song.videoId}
                      onClick={() => add(song)}
                      className="btn-primary flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs"
                    >
                      {adding === song.videoId ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <PlusIcon className="h-3.5 w-3.5" />
                      )}
                      Queue
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

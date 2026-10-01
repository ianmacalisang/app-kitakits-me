'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import {
  createVideokeRoom,
  getVideokeLobby,
  requestVideokeJoin,
  respondVideokeInvite,
} from '@/actions/videoke'
import { LIVE_EVENT, type LiveEventDetail, toast } from '@/lib/events'
import type { VideokeRoomSummary } from '@/lib/videoke'

import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { Spinner } from '../Spinner'
import { MicIcon, MusicIcon, PlusIcon, UsersIcon } from '../icons'
import { EqBars } from './EqBars'

type Lobby = {
  rooms: VideokeRoomSummary[]
  invites: VideokeRoomSummary[]
  discover: VideokeRoomSummary[]
}

// Videoke lobby — create a room, answer pending invites, jump back into open
// rooms. Live updates arrive as LIVE_EVENTs pushed over the app-wide socket.
export function VideokeLobby({ initial }: { initial: Lobby }) {
  const router = useRouter()
  const [lobby, setLobby] = useState(initial)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const [busyInvite, setBusyInvite] = useState<number | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced — room writes fan out several live events back-to-back.
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      getVideokeLobby()
        .then(setLobby)
        .catch(() => {})
    }, 250)
  }, [])

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    },
    [],
  )

  useEffect(() => {
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveEventDetail>).detail
      if (detail?.type === 'videoke:update' || detail?.type === 'videoke:invite') refresh()
    }
    window.addEventListener(LIVE_EVENT, onLive)
    return () => window.removeEventListener(LIVE_EVENT, onLive)
  }, [refresh])

  const create = () => {
    startTransition(async () => {
      let res = await createVideokeRoom(name)
      // Busy in another hangout — offer to leave it and open this room.
      if (!res.ok && res.busyHangout) {
        const where = res.busyHangout.name ? `“${res.busyHangout.name}”` : 'another hangout'
        if (window.confirm(`You're already in ${where}. Leave it and open a room?`)) {
          res = await createVideokeRoom(name, true)
        }
      }
      if (!res.ok) {
        toast(res.error)
        return
      }
      router.push(`/hangouts/videoke/${res.roomId}`)
    })
  }

  const respond = (roomId: number, accept: boolean) => {
    setBusyInvite(roomId)
    startTransition(async () => {
      let res = await respondVideokeInvite(roomId, accept)
      if (!res.ok && accept && res.busyHangout) {
        const where = res.busyHangout.name ? `“${res.busyHangout.name}”` : 'another hangout'
        if (window.confirm(`You're already in ${where}. Leave it and join this room?`)) {
          res = await respondVideokeInvite(roomId, accept, true)
        }
      }
      setBusyInvite(null)
      if (!res.ok) {
        toast(res.error)
        refresh()
        return
      }
      if (accept) router.push(`/hangouts/videoke/${roomId}`)
      else refresh()
    })
  }

  // "Join" on a mutual's room knocks — the host lets you in through the
  // normal invite path.
  const askToJoin = (roomId: number) => {
    setBusyInvite(roomId)
    startTransition(async () => {
      const res = await requestVideokeJoin(roomId)
      setBusyInvite(null)
      if (!res.ok) {
        toast(res.error)
        refresh()
        return
      }
      setLobby((l) => ({
        ...l,
        discover: l.discover.map((r) => (r.id === roomId ? { ...r, asked: true } : r)),
      }))
      toast('Request sent — the host can let you in.')
    })
  }

  return (
    <div>
      <header className="relative mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-accent-500 via-accent-700 to-accent-950 p-4 text-white shadow-lg shadow-accent-900/25 sm:p-5">
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_80%)]"
        />
        <MusicIcon
          aria-hidden
          className="absolute right-16 top-4 h-5 w-5 -rotate-12 text-white/25"
        />
        <MusicIcon
          aria-hidden
          className="absolute bottom-5 right-6 h-4 w-4 rotate-12 text-white/20"
        />
        <div className="relative flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/40 backdrop-blur-sm">
            <MicIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Videoke</h1>
            <p className="truncate text-sm text-white/75">
              Karaoke rooms with your mutual follows.
            </p>
          </div>
          <EqBars className="h-6 shrink-0 text-white/70 max-sm:hidden" />
        </div>
      </header>

      {/* New room */}
      <section className="glass mb-4 rounded-3xl p-4">
        <p className="mb-3 text-sm font-semibold">Start a room</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Room name (optional)"
            className="glass-input min-w-0 flex-1 rounded-full"
          />
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="btn-primary flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm"
          >
            {pending ? <Spinner className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
            Create
          </button>
        </div>
      </section>

      {lobby.invites.length > 0 && (
        <section className="mb-4">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Invited to you
          </p>
          <ul className="flex flex-col gap-2">
            {lobby.invites.map((room) => (
              <li
                key={room.id}
                className="glass flex items-center gap-3 rounded-2xl p-3 ring-1 ring-accent-500/20"
              >
                {room.invitedBy ? (
                  <Avatar src={room.invitedBy.avatarUrl} name={room.invitedBy.name} size="md" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-md shadow-accent-600/30">
                    <MicIcon className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{room.name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {room.invitedBy ? `${room.invitedBy.name} invited you` : 'You were invited'} ·{' '}
                    {room.memberCount} {room.memberCount === 1 ? 'singer' : 'singers'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyInvite === room.id}
                  onClick={() => respond(room.id, false)}
                  className="shrink-0 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:bg-black/10 disabled:opacity-60 dark:bg-white/10 dark:text-neutral-300"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={busyInvite === room.id}
                  onClick={() => respond(room.id, true)}
                  className="btn-primary flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs"
                >
                  {busyInvite === room.id ? <Spinner className="h-3.5 w-3.5" /> : null}
                  Join
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lobby.discover.length > 0 && (
        <section className="mb-4">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Friends&apos; rooms
          </p>
          <ul className="flex flex-col gap-2">
            {lobby.discover.map((room) => {
              const host = room.members.find((m) => m.id === room.hostId) ?? null
              return (
                <li key={room.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                  {host ? (
                    <Avatar src={host.avatarUrl} name={host.name} size="md" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-md shadow-accent-600/30">
                      <MicIcon className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{room.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {host ? `Hosted by ${host.name}` : 'Open room'} · {room.memberCount}{' '}
                      {room.memberCount === 1 ? 'singer' : 'singers'}
                      {room.nowPlaying ? ' · on stage' : ''}
                    </p>
                  </div>
                  {room.nowPlaying && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-500">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-red-500" />
                      Live
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={busyInvite === room.id || room.asked}
                    onClick={() => askToJoin(room.id)}
                    className="btn-primary flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs disabled:opacity-60"
                  >
                    {busyInvite === room.id ? <Spinner className="h-3.5 w-3.5" /> : null}
                    {room.asked ? 'Requested' : 'Join'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Your rooms
        </p>
        {lobby.rooms.length === 0 ? (
          <EmptyState
            icon={<MicIcon />}
            title="No rooms yet"
            message="Create a room and invite your mutuals for a videoke session."
            compact
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {lobby.rooms.map((room) => (
              <li key={room.id}>
                <Link
                  href={`/hangouts/videoke/${room.id}`}
                  className="glass group flex items-center gap-3.5 rounded-3xl p-3 transition-all hover:shadow-md"
                >
                  {/* Stage tile — live EQ while a song is on, mic otherwise */}
                  <span
                    className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl ${
                      room.nowPlaying
                        ? 'bg-gradient-to-br from-accent-500 to-accent-800 text-white shadow-md shadow-accent-600/30'
                        : 'bg-black/5 text-neutral-400 dark:bg-white/10'
                    }`}
                  >
                    {room.nowPlaying ? (
                      <EqBars className="h-5 text-white" />
                    ) : (
                      <MicIcon className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{room.name}</span>
                      {room.nowPlaying && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-500">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-red-500" />
                          Live
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
                      {room.nowPlaying ? (
                        <>
                          <MusicIcon className="h-3 w-3 shrink-0 text-accent-500" />
                          <span className="truncate">Now: {room.nowPlaying}</span>
                        </>
                      ) : (
                        <>
                          <UsersIcon className="h-3 w-3 shrink-0" />
                          {room.memberCount} {room.memberCount === 1 ? 'singer' : 'singers'}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 -space-x-2">
                    {room.members.slice(0, 3).map((m) => (
                      <span
                        key={m.id}
                        className="rounded-full ring-2 ring-white dark:ring-neutral-900"
                      >
                        <Avatar src={m.avatarUrl} name={m.name} size="sm" />
                      </span>
                    ))}
                    {room.memberCount > 3 && (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold text-neutral-600 ring-2 ring-white dark:bg-white/10 dark:text-neutral-300 dark:ring-neutral-900">
                        +{room.memberCount - 3}
                      </span>
                    )}
                  </div>
                  <span className="btn-primary shrink-0 rounded-full px-3.5 py-1.5 text-xs">
                    Open
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

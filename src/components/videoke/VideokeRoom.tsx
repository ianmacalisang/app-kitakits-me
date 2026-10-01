'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import {
  endVideokeRoom,
  getVideokeRoom,
  inviteToVideoke,
  leaveVideokeRoom,
  removeVideokeSong,
  reorderVideokeQueue,
  respondVideokeInvite,
  videokeAdvance,
  videokePause,
  videokePlay,
} from '@/actions/videoke'
import { LIVE_EVENT, type LiveEventDetail, toast } from '@/lib/events'
import type { MutualHead } from '@/lib/mutuals'
import type { QueueItemData, VideokeRoomData } from '@/lib/videoke'

import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { Spinner } from '../Spinner'
import { useChat } from '../chat/ChatProvider'
import {
  ChevronLeftIcon,
  MicIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  StarIcon,
  UsersIcon,
  VolumeIcon,
} from '../icons'
import { EqBars } from './EqBars'
import { InvitePicker } from './InvitePicker'
import { MicMeter } from './MicMeter'
import { QueueList } from './QueueList'
import { SongSearch } from './SongSearch'
import { YouTubePlayer, type VideokePlayerHandle } from './YouTubePlayer'

// The live videoke room — synced host-controlled player on top, then
// members, song search, and the shared queue. Room state refreshes on
// videoke:update LIVE_EVENTs pushed over the app-wide socket; own mutations
// apply the room returned by the action so the UI doesn't wait for the push.
export function VideokeRoom({
  initial,
  mutuals,
  viewerId,
}: {
  initial: VideokeRoomData
  mutuals: MutualHead[]
  viewerId: number
}) {
  const router = useRouter()
  const chat = useChat()
  const [room, setRoomState] = useState(initial)
  const [audioOn, setAudioOn] = useState(false)
  const [pending, startTransition] = useTransition()
  const playerRef = useRef<VideokePlayerHandle>(null)
  // Dedupe the ENDED→advance handoff across tabs and replayed events — the
  // server's expectedItemId guard is the authoritative dedupe, this just
  // skips obviously redundant calls.
  const lastAdvanceRef = useRef<{ itemId: number; at: number } | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setRoom = useCallback((r: VideokeRoomData) => {
    setRoomState(r)
  }, [])

  // Debounced — one room write fans out several live events, and own
  // mutations already apply the room their action returned.
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      getVideokeRoom(initial.id)
        .then((r) => {
          if (r) setRoom(r)
          // Lost access — let the server re-render this route, which swaps
          // the room for the ask-to-join gate.
          else router.refresh()
        })
        .catch(() => {})
    }, 250)
  }, [initial.id, setRoom, router])

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    },
    [],
  )

  // Re-verify on mount — a router-cache/bfcache render can carry room data
  // the viewer no longer has rights to (e.g. they left on another tab).
  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveEventDetail>).detail
      // A knock arrives as videoke:request (host-targeted) — it changes the
      // host-visible "Asking to join" list, so it refreshes the room too.
      if (
        (detail?.type === 'videoke:update' || detail?.type === 'videoke:request') &&
        detail.roomId === initial.id
      )
        refresh()
    }
    window.addEventListener(LIVE_EVENT, onLive)
    return () => window.removeEventListener(LIVE_EVENT, onLive)
  }, [initial.id, refresh])

  const isHost = room.hostId === viewerId
  const isMember = room.members.some((m) => m.id === viewerId)
  const isInvitee = room.invites.some((i) => i.user.id === viewerId)
  const ended = room.status === 'ended'
  const canMutate = isMember && !ended

  const current = room.queue.find((q) => q.id === room.playback.itemId) ?? null
  const isPlaying = room.playback.state === 'playing' && !ended && current != null
  // Mic rights: the host plus whoever queued the song that's playing — the
  // LiveKit grant enforces it server-side too.
  const canSpeak = isHost || current?.addedBy?.id === viewerId

  const act = useCallback(
    (promise: Promise<{ ok: true; room?: VideokeRoomData } | { ok: false; error: string }>) => {
      startTransition(async () => {
        const res = await promise
        if (!res.ok) toast(res.error)
        else if (res.room) setRoom(res.room)
      })
    },
    [setRoom],
  )

  const pause = () => act(videokePause(room.id, playerRef.current?.getTime() ?? 0))
  const play = () => act(videokePlay(room.id))
  const skip = () => act(videokeAdvance(room.id, true, current?.id))

  // Every member's player reports ENDED — the first call advances the room
  // and the rest no-op server-side via the expectedItemId guard.
  const onEnded = useCallback(() => {
    const itemId = room.playback.itemId
    if (!itemId || !isMember) return
    const last = lastAdvanceRef.current
    if (last && last.itemId === itemId && Date.now() - last.at < 5_000) return
    lastAdvanceRef.current = { itemId, at: Date.now() }
    act(videokeAdvance(room.id, false, itemId))
  }, [isMember, room.playback.itemId, room.id, act])

  const remove = (item: QueueItemData) => act(removeVideokeSong(room.id, item.id))

  const move = (itemId: number, dir: -1 | 1) => {
    const queued = room.queue
      .filter((q) => q.state === 'queued')
      .sort((a, b) => a.position - b.position)
      .map((q) => q.id)
    const i = queued.indexOf(itemId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= queued.length) return
    ;[queued[i], queued[j]] = [queued[j], queued[i]]
    act(reorderVideokeQueue(room.id, queued))
  }

  const leave = () => {
    if (isHost && !window.confirm('Leaving ends the room for everyone. End it?')) return
    startTransition(async () => {
      const res = isHost ? await endVideokeRoom(room.id) : await leaveVideokeRoom(room.id)
      if (!res.ok) {
        toast(res.error)
        return
      }
      router.push('/hangouts/videoke')
    })
  }

  const respond = (accept: boolean) => {
    startTransition(async () => {
      const res = await respondVideokeInvite(room.id, accept)
      if (!res.ok) {
        toast(res.error)
        return
      }
      if (!accept) router.push('/hangouts/videoke')
      else if (res.room) setRoom(res.room)
    })
  }

  const onlineIds = useMemo(() => new Set(chat?.online.map((u) => u.id) ?? []), [chat?.online])

  // Invited but not yet a member — gate the room behind the invite.
  if (!isMember && isInvitee) {
    const inviter = room.invites.find((i) => i.user.id === viewerId)?.invitedBy ?? null
    return (
      // Fill the content area between the top nav (pt-24) and bottom dock
      // (pb-28) so the invite card lands dead-center, not just near the top.
      <div className="flex min-h-[calc(100dvh-13rem)] items-center justify-center">
        <div className="glass w-full max-w-md overflow-hidden rounded-3xl p-0 text-center">
          <div className="relative bg-gradient-to-br from-accent-500 via-accent-700 to-accent-950 px-6 py-8 text-white">
            <span
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
            />
            <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur-sm">
              <MicIcon className="h-8 w-8" />
            </span>
            <EqBars className="absolute bottom-3 right-4 h-4 text-white/60" />
          </div>
          <div className="p-6">
            <h1 className="text-xl font-bold tracking-tight">{room.name}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {inviter ? `${inviter.name} invited you` : "You've been invited"} — join to sing
              along.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => respond(false)}
                className="rounded-full bg-black/5 px-5 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-black/10 disabled:opacity-60 dark:bg-white/10 dark:text-neutral-300"
              >
                Decline
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => respond(true)}
                className="btn-primary flex items-center gap-2 rounded-full px-5 py-2 text-sm"
              >
                {pending && <Spinner className="h-4 w-4" />}
                Join room
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header — gradient hero matching the lobby and invite card */}
      <header className="relative mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-accent-500 via-accent-700 to-accent-950 p-4 text-white shadow-lg shadow-accent-900/25 sm:p-5">
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_80%)]"
        />
        <MusicIcon
          aria-hidden
          className="absolute right-5 top-4 h-5 w-5 -rotate-12 text-white/25"
        />
        <MusicIcon
          aria-hidden
          className="absolute bottom-4 right-16 h-4 w-4 rotate-12 text-white/20"
        />
        <div className="relative flex items-center gap-3.5">
          <Link
            href="/hangouts/videoke"
            aria-label="Back to Videoke"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          {room.host ? (
            <Avatar src={room.host.avatarUrl} name={room.host.name} size="md" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur-sm">
              <MicIcon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="truncate">{room.name}</span>
              {isPlaying && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-200 ring-1 ring-red-300/40">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-red-400" />
                  Live
                </span>
              )}
            </h1>
            <p className="flex items-center gap-1 text-xs text-white/75">
              <UsersIcon className="h-3 w-3" />
              {room.members.length} {room.members.length === 1 ? 'singer' : 'singers'}
              {room.host?.name ? ` · hosted by ${room.host.name}` : ''}
            </p>
          </div>
          {isPlaying && <EqBars className="h-6 shrink-0 text-white/70 max-sm:hidden" />}
          {isMember && !ended && (
            <button
              type="button"
              onClick={leave}
              disabled={pending}
              className="shrink-0 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25 disabled:opacity-60"
            >
              {isHost ? 'End room' : 'Leave'}
            </button>
          )}
        </div>
      </header>

      {/* Members */}
      <section className="glass mb-4 rounded-3xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            In the room
          </p>
          {isHost && !ended && <InvitePicker room={room} mutuals={mutuals} onRoom={setRoom} />}
        </div>
        {/* Join requests — members who knocked while the door was shut.
            Letting them in goes through the normal invite path. */}
        {isHost && !ended && (room.requests ?? []).length > 0 && (
          <div className="mb-3 rounded-2xl bg-black/[0.04] p-3 dark:bg-white/5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Asking to join
            </p>
            <ul className="flex flex-col gap-2">
              {(room.requests ?? []).map((r) => (
                <li key={r.id} className="flex items-center gap-2.5">
                  <Avatar src={r.avatarUrl} name={r.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(inviteToVideoke(room.id, [r.id]))}
                    className="btn-primary shrink-0 rounded-full px-3.5 py-1.5 text-xs"
                  >
                    Let in
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          {room.members.map((m) => (
            <div key={m.id} className="flex flex-col items-center gap-1">
              <span className="relative">
                <Avatar src={m.avatarUrl} name={m.name} size="md" />
                {m.id === room.hostId ? (
                  <span
                    title="Host"
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950 ring-2 ring-white dark:ring-neutral-900"
                  >
                    <StarIcon className="h-2.5 w-2.5" />
                  </span>
                ) : m.id !== viewerId ? (
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-neutral-900 ${
                      onlineIds.has(m.id) ? 'bg-emerald-500' : 'bg-neutral-300'
                    }`}
                  />
                ) : null}
              </span>
              <span className="max-w-16 truncate text-[11px] text-neutral-600 dark:text-neutral-300">
                {m.name.split(' ')[0]}
                {m.id === room.hostId ? ' · host' : ''}
              </span>
            </div>
          ))}
          {room.invites.map((i) => (
            <div key={i.user.id} className="flex flex-col items-center gap-1 opacity-60">
              <span className="rounded-full border-2 border-dashed border-neutral-300 p-0.5 dark:border-neutral-600">
                <Avatar src={i.user.avatarUrl} name={i.user.name} size="md" />
              </span>
              <span className="max-w-16 truncate text-[11px] text-neutral-500">
                {i.user.name.split(' ')[0]} · invited
              </span>
            </div>
          ))}
        </div>
      </section>

      {ended && (
        <div className="glass mb-4 rounded-2xl px-4 py-3 text-center text-sm font-medium text-neutral-500">
          This videoke room has ended.
        </div>
      )}

      {/* Song search sits on top of the player — members only, hidden once
          the room ends */}
      {canMutate && (
        <section className="mb-4">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Find a song
          </p>
          <SongSearch roomId={room.id} onRoom={setRoom} />
        </section>
      )}

      {/* Stage — the synced player on a dark panel with ambient accent glows */}
      <section className="relative mb-4 overflow-hidden rounded-3xl bg-neutral-950 text-white shadow-xl shadow-black/25 ring-1 ring-white/10">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/4 h-48 w-48 rounded-full bg-accent-500/30 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 right-1/4 h-48 w-48 rounded-full bg-accent-400/20 blur-3xl"
        />

        <div className="relative aspect-video bg-black">
          {/* Masks YouTube's title/share link bar at the top of the frame —
              visually hides it and swallows host clicks that would open
              YouTube. pointer-events-auto on purpose. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 z-[5] h-14 bg-gradient-to-b from-black via-black/85 to-transparent"
          />
          <YouTubePlayer
            ref={playerRef}
            videoId={current?.videoId ?? null}
            playing={isPlaying}
            positionSec={room.playback.positionSec}
            startedAt={room.playback.startedAt}
            serverNow={room.serverNow}
            interactive={isHost}
            onEnded={onEnded}
            onUserPlay={isHost ? play : undefined}
            onUserPause={isHost ? pause : undefined}
          />
          {/* Empty stage — nothing queued/playing yet */}
          {!current && !ended && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-neutral-900 to-neutral-950">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/15">
                <MicIcon className="h-8 w-8 text-white/60" />
              </span>
              <p className="text-sm font-medium text-white/60">
                {canMutate
                  ? 'The stage is set — queue a song to start.'
                  : 'Waiting for the host to queue a song.'}
              </p>
            </div>
          )}
          {!audioOn && !ended && (
            <button
              type="button"
              onClick={() => {
                playerRef.current?.unlockAudio()
                setAudioOn(true)
              }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 text-white backdrop-blur-[2px]"
            >
              <span className="btn-primary flex h-14 w-14 items-center justify-center rounded-full">
                <VolumeIcon className="h-6 w-6" />
              </span>
              <span className="text-sm font-semibold">Tap to enable sound &amp; join</span>
            </button>
          )}
        </div>

        {/* Transport bar — now playing + controls. On small screens the
            controls drop to a second row below the now-playing line. */}
        <div className="relative flex flex-col gap-3 border-t border-white/10 bg-white/[0.04] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <EqBars
              playing={isPlaying}
              className={`h-4 w-5 shrink-0 ${isPlaying ? 'text-accent-300' : 'text-white/30'}`}
            />
            <div className="min-w-0">
              {current ? (
                <>
                  <p className="truncate text-sm font-semibold text-white">{current.title}</p>
                  <p className="truncate text-xs text-white/50">
                    {room.playback.state === 'paused' ? 'Paused' : 'Now playing'}
                    {current.addedBy ? ` · picked by ${current.addedBy.name}` : ''}
                  </p>
                </>
              ) : (
                <p className="text-sm text-white/50">Nothing playing — queue a song to start.</p>
              )}
            </div>
          </div>
          {canMutate && (
            <div className="flex items-center justify-between gap-2 sm:justify-normal">
              <MicMeter roomId={room.id} canSpeak={canSpeak} />
              {isHost && !ended && (
                <div className="flex shrink-0 items-center gap-2">
                  {room.playback.state === 'playing' ? (
                    <button
                      type="button"
                      onClick={pause}
                      disabled={pending}
                      aria-label="Pause"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-50"
                    >
                      <PauseIcon className="h-4.5 w-4.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={play}
                      disabled={
                        pending || (!current && room.queue.every((q) => q.state !== 'queued'))
                      }
                      aria-label="Play"
                      className="btn-primary flex h-10 w-10 items-center justify-center rounded-full"
                    >
                      <PlayIcon className="h-4.5 w-4.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={skip}
                    disabled={pending || !current}
                    className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-50"
                  >
                    <SkipForwardIcon className="h-3.5 w-3.5" />
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Queue
        </p>
        {room.queue.length === 0 && !current ? (
          <EmptyState
            icon={<MicIcon />}
            title="The stage is quiet"
            message={
              canMutate
                ? 'Search a videoke song above to get things started.'
                : 'The host will queue something soon.'
            }
            compact
          />
        ) : (
          <QueueList
            queue={room.queue}
            meId={viewerId}
            isHost={isHost}
            canMutate={canMutate}
            onRemove={remove}
            onMove={move}
          />
        )}
      </section>
    </div>
  )
}

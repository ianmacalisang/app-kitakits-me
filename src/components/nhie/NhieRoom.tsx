'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import {
  endNhieRoom,
  getNhieRoom,
  inviteToNhie,
  leaveNhieRoom,
  nhieAnswer,
  nhieNext,
  nhiePrompt,
  nhieSkipTurn,
  rematchNhie,
  respondNhieInvite,
  startNhie,
} from '@/actions/nhie'
import { MutualInvitePicker } from '@/components/MutualInvitePicker'
import { LIVE_EVENT, type LiveEventDetail, toast } from '@/lib/events'
import type { NhieRoomData } from '@/lib/nhieRooms'
import { CUSTOM_PROMPT_MAX } from '@/lib/nhie'
import type { MutualHead } from '@/lib/mutuals'

import { Avatar } from '../Avatar'
import { Spinner } from '../Spinner'
import { useChat } from '../chat/ChatProvider'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  HandIcon,
  QuestionIcon,
  StarIcon,
  UsersIcon,
  XIcon,
} from '../icons'

// The live NHIE circle — seated players ring the prompt card up top, your own
// answer buttons sit inside it. Turn order rotates the prompt call; answers
// stay hidden until the circle resolves. Room state refreshes on nhie:*
// LIVE_EVENTs pushed over the app-wide socket; own mutations apply the room
// the action returns.
export function NhieRoom({
  initial,
  mutuals,
  viewerId,
}: {
  initial: NhieRoomData
  mutuals: MutualHead[]
  viewerId: number
}) {
  const router = useRouter()
  const chat = useChat()
  const [room, setRoomState] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [answerBusy, setAnswerBusy] = useState(false)
  const [customText, setCustomText] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setRoom = useCallback((r: NhieRoomData) => {
    setRoomState(r)
    setAnswerBusy(false)
  }, [])

  // Debounced — one room write fans out several live events, and own
  // mutations already apply the room their action returned.
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      getNhieRoom(initial.id)
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
      // A knock arrives as nhie:request (host-targeted) — it changes the
      // host-visible "Asking to join" list, so it refreshes the room too.
      if (
        (detail?.type === 'nhie:update' || detail?.type === 'nhie:request') &&
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
  const game = room.game
  const playing = game.state === 'playing'
  const finished = game.state === 'finished'
  const me = game.players.find((p) => p.user.id === viewerId) ?? null
  const iAmOut = me?.isOut ?? false
  const myPromptTurn = playing && game.phase === 'prompting' && me?.isTurn === true
  const turnOwner = game.players.find((p) => p.isTurn) ?? null
  const nextOwner = useMemo(() => {
    // After the reveal the turn passes to the next seat still in — same
    // walking rule the server's nextActiveSeat applies.
    const players = game.players
    const n = players.length
    for (let i = 1; i <= n; i++) {
      const p = players[(game.turnSeat + i) % n]
      if (p && !p.isOut) return p
    }
    return null
  }, [game.players, game.turnSeat])

  const act = useCallback(
    (promise: Promise<{ ok: true; room?: NhieRoomData } | { ok: false; error: string }>) => {
      startTransition(async () => {
        const res = await promise
        if (!res.ok) toast(res.error)
        else if (res.room) setRoom(res.room)
      })
    },
    [setRoom],
  )

  const answer = (a: 'have' | 'never') => {
    if (answerBusy) return
    setAnswerBusy(true)
    startTransition(async () => {
      const res = await nhieAnswer(room.id, a)
      setAnswerBusy(false)
      if (!res.ok) {
        toast(res.error)
        refresh() // the circle may have moved on under us
      } else if (res.room) {
        setRoom(res.room)
      }
    })
  }

  const callPrompt = (text?: string) => {
    act(nhiePrompt(room.id, text))
    setCustomText('')
  }

  const leave = () => {
    if (isHost && !window.confirm('Leaving ends the room for everyone. End it?')) return
    startTransition(async () => {
      const res = isHost ? await endNhieRoom(room.id) : await leaveNhieRoom(room.id)
      if (!res.ok) {
        toast(res.error)
        return
      }
      router.push('/hangouts/nhie')
    })
  }

  const respond = (accept: boolean) => {
    startTransition(async () => {
      let res = await respondNhieInvite(room.id, accept)
      if (!res.ok && accept && res.busyHangout) {
        const where = res.busyHangout.name ? `“${res.busyHangout.name}”` : 'another hangout'
        if (window.confirm(`You're already in ${where}. Leave it and join this circle?`)) {
          res = await respondNhieInvite(room.id, accept, true)
        }
      }
      if (!res.ok) {
        toast(res.error)
        return
      }
      if (!accept) router.push('/hangouts/nhie')
      else if (res.room) setRoom(res.room)
    })
  }

  const onlineIds = useMemo(() => new Set(chat?.online.map((u) => u.id) ?? []), [chat?.online])

  const ticker = finished
    ? game.winner
      ? `${game.winner.name} is the last one with fingers up — innocent champion!`
      : 'Game over — everyone ran out of fingers together.'
    : !playing
      ? null
      : game.phase === 'prompting'
        ? turnOwner
          ? `${turnOwner.user.name} is calling the next “Never have I ever…”`
          : 'Waiting for the next prompt.'
        : game.phase === 'answering'
          ? `${game.answeredCount} of ${game.activeCount} answered`
          : 'Reveal!'

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
              <HandIcon className="h-8 w-8" />
            </span>
          </div>
          <div className="p-6">
            <h1 className="text-xl font-bold tracking-tight">{room.name}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {inviter ? `${inviter.name} invited you` : "You've been invited"} — join to play.
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
                Join circle
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
        <HandIcon aria-hidden className="absolute right-5 top-4 h-5 w-5 -rotate-12 text-white/25" />
        <HandIcon
          aria-hidden
          className="absolute bottom-4 right-16 h-4 w-4 rotate-12 text-white/20"
        />
        <div className="relative flex items-center gap-3.5">
          <Link
            href="/hangouts/nhie"
            aria-label="Back to Never Have I Ever"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          {room.host ? (
            <Avatar src={room.host.avatarUrl} name={room.host.name} size="md" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur-sm">
              <HandIcon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="truncate">{room.name}</span>
              {playing && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-200 ring-1 ring-red-300/40">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-red-400" />
                  Game {game.round}
                </span>
              )}
            </h1>
            <p className="flex items-center gap-1 text-xs text-white/75">
              <UsersIcon className="h-3 w-3" />
              {room.members.length} {room.members.length === 1 ? 'player' : 'players'}
              {room.host?.name ? ` · hosted by ${room.host.name}` : ''}
            </p>
          </div>
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
            In the circle
          </p>
          {isHost && !ended && (
            <MutualInvitePicker
              members={room.members}
              invitees={room.invites.map((i) => i.user)}
              mutuals={mutuals}
              onInvite={async (id) => {
                const res = await inviteToNhie(room.id, [id])
                if (res.ok && res.room) setRoom(res.room)
                return res
              }}
            />
          )}
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
                    onClick={() => act(inviteToNhie(room.id, [r.id]))}
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
          This room has ended.
        </div>
      )}

      {/* The circle — dark panel holding the players, prompt card, and ticker */}
      <section className="relative mb-4 overflow-hidden rounded-3xl bg-neutral-950 text-white shadow-xl shadow-black/25 ring-1 ring-white/10">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/4 h-48 w-48 rounded-full bg-accent-500/30 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 right-1/4 h-48 w-48 rounded-full bg-accent-400/20 blur-3xl"
        />

        <div className="relative px-4 pb-5 pt-5 sm:px-6">
          {game.state === 'lobby' ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="relative mb-1 flex h-24 w-24 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/15">
                <HandIcon className="h-10 w-10 text-white/40" />
              </span>
              <p className="text-sm font-medium text-white/60">
                {isHost
                  ? room.members.length >= 2
                    ? 'The circle is set — start when everyone’s in.'
                    : 'Invite a mutual to form a circle — you need at least 2 players.'
                  : 'Waiting for the host to start.'}
              </p>
              {isHost && !ended && (
                <button
                  type="button"
                  disabled={pending || room.members.length < 2}
                  onClick={() => act(startNhie(room.id))}
                  className="btn-primary mt-1 flex items-center gap-2 rounded-full px-5 py-2 text-sm disabled:opacity-50"
                >
                  {pending ? <Spinner className="h-4 w-4" /> : null}
                  Start the game
                </button>
              )}
            </div>
          ) : (
            <>
              {/* The circle — vignetted panel holding the seated players */}
              <div className="relative rounded-[2rem] bg-[radial-gradient(130%_110%_at_50%_0%,rgba(124,58,160,0.28),rgba(58,22,88,0.4)_52%,rgba(20,8,32,0.7))] px-3 pb-6 pt-5 ring-1 ring-inset ring-violet-300/15 sm:px-5">
                {/* Players — seat order. Turn holder's pod pulses; answered
                    players show a check; the out ones dim with no fingers. */}
                <ul className="flex flex-wrap items-start justify-center gap-x-5 gap-y-5 sm:gap-x-8">
                  {game.players.map((p) => {
                    const reveal = game.answers?.find((a) => a.user.id === p.user.id) ?? null
                    return (
                      <li key={p.user.id} className="flex w-auto flex-col items-center">
                        <span className="relative">
                          <Avatar src={p.user.avatarUrl} name={p.user.name} size="md" />
                          {p.isTurn && game.phase !== 'revealed' && (
                            <span className="absolute -inset-0.5 animate-pulse rounded-full ring-2 ring-accent-400" />
                          )}
                          {p.isOut ? (
                            <span
                              title="Out — no fingers left"
                              className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-neutral-500 text-white ring-2 ring-neutral-950/60"
                            >
                              <XIcon className="h-2.5 w-2.5" />
                            </span>
                          ) : p.hasAnswered && game.phase === 'answering' ? (
                            <span
                              title="Locked in"
                              className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-violet-950/60"
                            >
                              <CheckIcon className="h-2.5 w-2.5" />
                            </span>
                          ) : (
                            p.user.id === room.hostId && (
                              <span
                                title="Host"
                                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950 ring-2 ring-violet-950/60"
                              >
                                <StarIcon className="h-2.5 w-2.5" />
                              </span>
                            )
                          )}
                        </span>
                        <span
                          className={`mt-1.5 max-w-36 truncate text-[11px] ${
                            p.isTurn && game.phase === 'prompting'
                              ? 'font-semibold text-accent-300'
                              : p.isOut
                                ? 'text-white/30 line-through'
                                : 'text-white/65'
                          }`}
                        >
                          {p.user.name.split(' ')[0]}
                        </span>
                        {/* Fingers — filled dots are fingers still up */}
                        {!p.isOut && (
                          <span className="mt-1 flex gap-0.5" title={`${p.fingers} fingers left`}>
                            {Array.from({ length: Math.max(p.fingers, 0) }, (_, i) => (
                              <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent-300" />
                            ))}
                          </span>
                        )}
                        {reveal && (
                          <span
                            className={`mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ${
                              reveal.answer === 'have'
                                ? 'bg-rose-500/15 text-rose-300 ring-rose-400/25'
                                : 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25'
                            }`}
                          >
                            {reveal.answer === 'have' ? 'I have' : 'Never'}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {/* Center of the circle — the prompt card / reveal / winner */}
                <div className="mt-5 flex flex-col items-center gap-3">
                  {finished ? (
                    <>
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/15 ring-1 ring-amber-300/40">
                        <HandIcon className="h-8 w-8 text-amber-300" />
                      </span>
                      <p className="text-center text-sm font-semibold text-white">
                        {game.winner
                          ? `${game.winner.name} wins — last fingers standing!`
                          : 'Game over — everyone busted together!'}
                      </p>
                      {isHost && !ended && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(rematchNhie(room.id))}
                          className="btn-primary flex items-center gap-2 rounded-full px-5 py-2 text-sm disabled:opacity-50"
                        >
                          {pending ? <Spinner className="h-4 w-4" /> : null}
                          Play again
                        </button>
                      )}
                    </>
                  ) : game.phase === 'prompting' ? (
                    myPromptTurn ? (
                      <div className="flex w-full max-w-sm flex-col items-center gap-2.5">
                        <p className="text-center text-sm font-semibold text-white">
                          Your call — say a “Never have I ever…”
                        </p>
                        <div className="flex w-full gap-2">
                          <input
                            value={customText}
                            onChange={(e) => setCustomText(e.target.value)}
                            maxLength={CUSTOM_PROMPT_MAX}
                            placeholder="…or write your own"
                            className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white outline-none ring-1 ring-white/15 placeholder:text-white/35 focus:ring-accent-400/60"
                          />
                          <button
                            type="button"
                            disabled={pending || !customText.trim()}
                            onClick={() => callPrompt(customText)}
                            className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm disabled:opacity-50"
                          >
                            Ask
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => callPrompt()}
                          className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-50"
                        >
                          Draw from the deck
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2.5">
                        <p className="text-center text-sm font-medium text-white/60">
                          {turnOwner
                            ? `${turnOwner.user.name} is thinking of a “Never have I ever…”`
                            : 'Waiting for the next prompt.'}
                        </p>
                        {isHost && turnOwner && turnOwner.user.id !== viewerId && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => act(nhieSkipTurn(room.id))}
                            className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/70 ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-50"
                          >
                            Skip {turnOwner.user.name.split(' ')[0]}’s turn
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <>
                      {/* The prompt card — big statement, answers below */}
                      <div className="w-full max-w-md rounded-3xl bg-white/[0.06] px-5 py-5 text-center ring-1 ring-white/10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                          Never have I ever
                        </p>
                        <p className="mt-1.5 text-lg font-bold leading-snug text-white">
                          {game.prompt?.text}
                        </p>
                        {game.prompt?.by && (
                          <p className="mt-1 text-[11px] text-white/40">
                            called by {game.prompt.by.name.split(' ')[0]}
                          </p>
                        )}
                      </div>
                      {game.phase === 'answering' && me && !iAmOut && !game.myAnswer ? (
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            disabled={answerBusy || pending}
                            onClick={() => answer('have')}
                            className="flex items-center gap-1.5 rounded-full bg-rose-500/20 px-5 py-2 text-sm font-bold text-rose-200 ring-1 ring-rose-400/40 transition hover:bg-rose-500/30 disabled:opacity-50"
                          >
                            <HandIcon className="h-4 w-4" />I have
                          </button>
                          <button
                            type="button"
                            disabled={answerBusy || pending}
                            onClick={() => answer('never')}
                            className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-5 py-2 text-sm font-bold text-emerald-200 ring-1 ring-emerald-400/40 transition hover:bg-emerald-500/25 disabled:opacity-50"
                          >
                            <CheckIcon className="h-4 w-4" />
                            Never
                          </button>
                        </div>
                      ) : (
                        <p
                          className={`rounded-full px-3.5 py-1.5 text-center text-xs font-medium ring-1 backdrop-blur-sm ${
                            game.phase === 'revealed'
                              ? 'bg-accent-500/20 text-accent-200 ring-accent-400/40'
                              : 'bg-black/40 text-white/60 ring-white/10'
                          }`}
                        >
                          {game.phase === 'revealed'
                            ? game.lastResult && game.lastResult.drops.length > 0
                              ? `${game.lastResult.drops
                                  .map((d) => d.name.split(' ')[0])
                                  .join(', ')} ${
                                  game.lastResult.drops.length === 1 ? 'drops' : 'drop'
                                } a finger.`
                              : 'Nobody confessed — fingers stay up.'
                            : game.myAnswer
                              ? `Locked in “${game.myAnswer === 'have' ? 'I have' : 'Never'}” — ${game.answeredCount}/${game.activeCount} answered.`
                              : ticker}
                        </p>
                      )}
                      {game.phase === 'revealed' &&
                        !finished &&
                        (nextOwner?.user.id === viewerId || isHost) && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => act(nhieNext(room.id))}
                            className="btn-primary flex items-center gap-2 rounded-full px-5 py-2 text-sm disabled:opacity-50"
                          >
                            {pending ? <Spinner className="h-4 w-4" /> : null}
                            {nextOwner?.user.id === viewerId ? 'Your turn — next' : 'Next prompt'}
                          </button>
                        )}
                    </>
                  )}
                </div>
              </div>

              {/* My status line — fingers left, or the spectator note */}
              {playing && me ? (
                iAmOut ? (
                  <div className="mt-4 flex justify-center">
                    <p className="flex items-center gap-1.5 rounded-full bg-neutral-500/10 px-3.5 py-1.5 text-xs font-semibold text-neutral-300 ring-1 ring-white/20">
                      <XIcon className="h-3.5 w-3.5" />
                      You’re out — watching the rest of the game.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 flex justify-center">
                    <p className="flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3.5 py-1.5 text-xs font-semibold text-accent-200 ring-1 ring-accent-400/30">
                      <HandIcon className="h-3.5 w-3.5" />
                      {me.fingers} {me.fingers === 1 ? 'finger' : 'fingers'} up
                    </p>
                  </div>
                )
              ) : playing ? (
                <p className="mt-4 text-center text-xs text-white/40">
                  Watching this game — the next round seats you.
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* Circle bar — the room state line */}
        <div className="relative flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-xs text-white/50">
            {ended
              ? 'Game over.'
              : playing
                ? `Game ${game.round} · ${game.activeCount} still in`
                : finished
                  ? `Game ${game.round} finished`
                  : 'Never Have I Ever · last one with fingers up wins'}
          </p>
        </div>
      </section>

      {/* How to play — a little rules card under the circle, tucked away by
          default; first-timers can flip it open. */}
      <section className="glass mb-4 overflow-hidden rounded-3xl">
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
          aria-expanded={guideOpen}
        >
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            <QuestionIcon className="h-3.5 w-3.5" />
            How to play Never Have I Ever
          </p>
          <ChevronDownIcon
            className={`h-4 w-4 text-neutral-400 transition-transform ${guideOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {guideOpen && (
          <ol className="flex flex-col gap-2.5 border-t border-black/5 px-4 py-3.5 text-[13px] leading-snug text-neutral-600 dark:border-white/10 dark:text-neutral-300">
            <Rule n={1}>
              Everyone starts with <b>5 fingers up</b>. Players take turns calling a “Never have I
              ever…” — drawn from the deck or written fresh.
            </Rule>
            <Rule n={2}>
              Everyone still in answers <b>“I have”</b> or <b>“Never”</b>. Answers stay hidden until
              the whole circle has locked in — no peeking.
            </Rule>
            <Rule n={3}>
              Every “I have” <b>drops a finger</b> when the circle resolves. Hit zero and you’re out
              — you can keep watching, though.
            </Rule>
            <Rule n={4}>
              The <b>last player with fingers up wins</b> and earns <b>10 points</b>. If everyone
              busts on the same prompt, nobody wins.
            </Rule>
          </ol>
        )}
      </section>
    </div>
  )
}

// One numbered step in the "how to play" list.
function Rule({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-[10px] font-bold text-accent-600">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

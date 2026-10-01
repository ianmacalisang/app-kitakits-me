'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import {
  endCardRoom,
  getCardRoom,
  inviteToCards,
  leaveCardRoom,
  rematchUnggoy,
  respondCardsInvite,
  startUnggoy,
  unggoyDraw,
} from '@/actions/cards'
import { MutualInvitePicker } from '@/components/MutualInvitePicker'
import { LIVE_EVENT, type LiveEventDetail, toast } from '@/lib/events'
import type { CardRoomData } from '@/lib/cards'
import type { MutualHead } from '@/lib/mutuals'
import { UNGGOY_CARD, type CardCode } from '@/lib/unggoy'

import { Avatar } from '../Avatar'
import { Spinner } from '../Spinner'
import { useChat } from '../chat/ChatProvider'
import {
  CardIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  QuestionIcon,
  StarIcon,
  UsersIcon,
} from '../icons'
import { CardsMic } from './CardsMic'
import { PlayingCard } from './PlayingCard'

// The live card table — opponents' face-down fans up top, the turn ticker in
// the middle, your own face-up hand along the bottom. When it's your turn,
// the previous player's fan becomes tappable: each back maps to a card index
// in their hand. Room state refreshes on cards:* LIVE_EVENTs pushed over the
// app-wide socket; own mutations apply the room the action returns.
export function CardsRoom({
  initial,
  mutuals,
  viewerId,
}: {
  initial: CardRoomData
  mutuals: MutualHead[]
  viewerId: number
}) {
  const router = useRouter()
  const chat = useChat()
  const [room, setRoomState] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [drawBusy, setDrawBusy] = useState<number | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setRoom = useCallback((r: CardRoomData) => {
    setRoomState(r)
    // A new deal clears any stale tap target.
    setDrawBusy(null)
  }, [])

  // Debounced — one room write fans out several live events, and own
  // mutations already apply the room their action returned.
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      getCardRoom(initial.id)
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
      // A knock arrives as cards:request (host-targeted) — it changes the
      // host-visible "Asking to join" list, so it refreshes the room too.
      if (
        (detail?.type === 'cards:update' || detail?.type === 'cards:request') &&
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
  const myTurn = playing && game.mySeat !== null && game.turnSeat === game.mySeat
  // The player whose fan I draw from when it's my turn.
  const drawSource = game.players.find((p) => p.isDrawSource) ?? null

  const act = useCallback(
    (promise: Promise<{ ok: true; room?: CardRoomData } | { ok: false; error: string }>) => {
      startTransition(async () => {
        const res = await promise
        if (!res.ok) toast(res.error)
        else if (res.room) setRoom(res.room)
      })
    },
    [setRoom],
  )

  const draw = (cardIndex: number) => {
    if (!myTurn || drawBusy !== null) return
    setDrawBusy(cardIndex)
    startTransition(async () => {
      const res = await unggoyDraw(room.id, cardIndex)
      setDrawBusy(null)
      if (!res.ok) {
        toast(res.error)
        refresh() // the hand may have changed under us
      } else if (res.room) {
        setRoom(res.room)
      }
    })
  }

  const leave = () => {
    if (isHost && !window.confirm('Leaving ends the room for everyone. End it?')) return
    startTransition(async () => {
      const res = isHost ? await endCardRoom(room.id) : await leaveCardRoom(room.id)
      if (!res.ok) {
        toast(res.error)
        return
      }
      router.push('/hangouts/cards')
    })
  }

  const respond = (accept: boolean) => {
    startTransition(async () => {
      let res = await respondCardsInvite(room.id, accept)
      if (!res.ok && accept && res.busyHangout) {
        const where = res.busyHangout.name ? `“${res.busyHangout.name}”` : 'another hangout'
        if (window.confirm(`You're already in ${where}. Leave it and join this table?`)) {
          res = await respondCardsInvite(room.id, accept, true)
        }
      }
      if (!res.ok) {
        toast(res.error)
        return
      }
      if (!accept) router.push('/hangouts/cards')
      else if (res.room) setRoom(res.room)
    })
  }

  const onlineIds = useMemo(() => new Set(chat?.online.map((u) => u.id) ?? []), [chat?.online])

  // Everyone seated except me, in seat order — they form the top arc.
  const opponents = game.players.filter((p) => p.user.id !== viewerId)

  const ticker = finished
    ? game.loser
      ? `${game.loser.name} got stuck with the unggoy — everyone else escaped!`
      : 'Round over.'
    : playing
      ? myTurn && drawSource
        ? `Your turn — pick a card from ${drawSource.user.name}.`
        : game.lastDraw?.by
          ? `${game.lastDraw.by.name} drew from ${game.lastDraw.from?.name ?? 'the previous player'}${game.lastDraw.paired ? ' and paired up' : ''}.`
          : `Round ${game.round} — wait for your turn.`
      : null

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
              <CardIcon className="h-8 w-8" />
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
                Join table
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
        <CardIcon aria-hidden className="absolute right-5 top-4 h-5 w-5 -rotate-12 text-white/25" />
        <CardIcon
          aria-hidden
          className="absolute bottom-4 right-16 h-4 w-4 rotate-12 text-white/20"
        />
        <div className="relative flex items-center gap-3.5">
          <Link
            href="/hangouts/cards"
            aria-label="Back to Cards"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          {room.host ? (
            <Avatar src={room.host.avatarUrl} name={room.host.name} size="md" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur-sm">
              <CardIcon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="truncate">{room.name}</span>
              {playing && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-200 ring-1 ring-red-300/40">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-red-400" />
                  Round {game.round}
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
            At the table
          </p>
          {isHost && !ended && (
            <MutualInvitePicker
              members={room.members}
              invitees={room.invites.map((i) => i.user)}
              mutuals={mutuals}
              onInvite={async (id) => {
                const res = await inviteToCards(room.id, [id])
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
                    onClick={() => act(inviteToCards(room.id, [r.id]))}
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
          This card room has ended.
        </div>
      )}

      {/* The table — dark felt panel holding the fans, ticker, and mic bar */}
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
              {/* Idle deck — a fanned stack of backs as the table's anchor */}
              <span className="relative mb-1 flex h-24 w-24 items-center justify-center">
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <PlayingCard faceDown size="md" style={{ transform: 'rotate(-12deg)' }} />
                </span>
                <span className="absolute left-[56%] top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <PlayingCard faceDown size="md" style={{ transform: 'rotate(4deg)' }} />
                </span>
                <span className="absolute left-[64%] top-[54%] -translate-x-1/2 -translate-y-1/2">
                  <PlayingCard faceDown size="md" style={{ transform: 'rotate(18deg)' }} />
                </span>
              </span>
              <p className="text-sm font-medium text-white/60">
                {isHost
                  ? room.members.length >= 2
                    ? 'The table is set — deal when everyone’s in.'
                    : 'Invite a mutual to fill the table — Unggoy needs at least 2 players.'
                  : 'Waiting for the host to deal.'}
              </p>
              {isHost && !ended && (
                <button
                  type="button"
                  disabled={pending || room.members.length < 2}
                  onClick={() => act(startUnggoy(room.id))}
                  className="btn-primary mt-1 flex items-center gap-2 rounded-full px-5 py-2 text-sm disabled:opacity-50"
                >
                  {pending ? <Spinner className="h-4 w-4" /> : null}
                  Deal Unggoy-Ungguyan
                </button>
              )}
            </div>
          ) : (
            <>
              {/* The felt — vignetted green table surface with an inner rim */}
              <div className="relative rounded-[2rem] bg-[radial-gradient(130%_110%_at_50%_0%,rgba(22,128,90,0.32),rgba(7,58,43,0.42)_52%,rgba(4,28,21,0.7))] px-3 pb-6 pt-5 ring-1 ring-inset ring-emerald-300/15 sm:px-5">
                {/* Opponents arc — seat order, me excluded. The turn holder's
                    pod pulses; on my turn the source's fan is tappable. */}
                <ul className="flex flex-wrap items-start justify-center gap-x-5 gap-y-5 sm:gap-x-8">
                  {opponents.map((p) => {
                    const tappable = myTurn && p.isDrawSource
                    return (
                      <li key={p.user.id} className="flex w-auto flex-col items-center">
                        <span className="relative">
                          <Avatar src={p.user.avatarUrl} name={p.user.name} size="md" />
                          {p.isTurn && (
                            <span className="absolute -inset-0.5 animate-pulse rounded-full ring-2 ring-accent-400" />
                          )}
                          {p.isOut ? (
                            <span
                              title="Safe — out of this round"
                              className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-emerald-950/60"
                            >
                              <CheckIcon className="h-2.5 w-2.5" />
                            </span>
                          ) : (
                            p.user.id === room.hostId && (
                              <span
                                title="Host"
                                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950 ring-2 ring-emerald-950/60"
                              >
                                <StarIcon className="h-2.5 w-2.5" />
                              </span>
                            )
                          )}
                        </span>
                        <span
                          className={`mt-1.5 max-w-36 truncate text-[11px] ${
                            p.isTurn ? 'font-semibold text-accent-300' : 'text-white/65'
                          }`}
                        >
                          {p.user.name.split(' ')[0]}
                          {p.isTurn ? '’s turn' : ''}
                        </span>
                        {p.isOut ? (
                          <span className="mt-1.5 flex min-h-[5.5rem] items-start">
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/25">
                              Safe
                            </span>
                          </span>
                        ) : (
                          <CardFan
                            count={p.cardCount}
                            faceDown
                            flip
                            size="md"
                            width={200}
                            tappable={tappable}
                            drawBusy={drawBusy}
                            onDraw={draw}
                          />
                        )}
                        {tappable && (
                          <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-accent-300">
                            Pick one
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {/* Center of the felt — the revealed unggoy on finish, else a
                    decorative deck stack and the turn ticker. */}
                <div className="mt-5 flex flex-col items-center gap-3">
                  {finished ? (
                    <>
                      <PlayingCard code={UNGGOY_CARD} size="lg" dealStagger={0} />
                      <p className="text-center text-sm font-semibold text-white">
                        {game.loser
                          ? `${game.loser.name} got stuck with the unggoy!`
                          : 'Round over.'}
                      </p>
                      {isHost && !ended && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(rematchUnggoy(room.id))}
                          className="btn-primary flex items-center gap-2 rounded-full px-5 py-2 text-sm disabled:opacity-50"
                        >
                          {pending ? <Spinner className="h-4 w-4" /> : null}
                          Deal again
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="relative flex h-10 w-16 items-center justify-center">
                        <PlayingCard
                          faceDown
                          size="xs"
                          style={{ transform: 'rotate(-10deg) translateX(-7px)' }}
                        />
                        <PlayingCard faceDown size="xs" style={{ transform: 'rotate(3deg)' }} />
                        <span className="absolute left-[55%]">
                          <PlayingCard
                            faceDown
                            size="xs"
                            style={{ transform: 'rotate(14deg) translateY(-2px)' }}
                          />
                        </span>
                      </span>
                      <p
                        className={`rounded-full px-3.5 py-1.5 text-center text-xs font-medium ring-1 backdrop-blur-sm ${
                          myTurn
                            ? 'bg-accent-500/20 text-accent-200 ring-accent-400/40'
                            : 'bg-black/40 text-white/60 ring-white/10'
                        }`}
                      >
                        {ticker}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* My hand — fanned face-up along the table's bottom edge,
                  pivoting at the base like cards held in a real hand. */}
              {game.myCards !== null ? (
                game.myCards.length > 0 ? (
                  <CardFan codes={game.myCards} width={340} />
                ) : (
                  <div className="mt-4 flex justify-center">
                    <p className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                      <CheckIcon className="h-3.5 w-3.5" />
                      You’re out — safe this round!
                    </p>
                  </div>
                )
              ) : playing ? (
                <p className="mt-4 text-center text-xs text-white/40">
                  Watching this round — the next deal seats you.
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* Table bar — voice mic plus the room state line */}
        <div className="relative flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-xs text-white/50">
            {ended
              ? 'Game over.'
              : playing
                ? `Round ${game.round} · ${game.players.filter((p) => !p.isOut).length} still in`
                : finished
                  ? `Round ${game.round} finished`
                  : 'Unggoy-Ungguyan · last one holding the monkey loses'}
          </p>
          {isMember && !ended && <CardsMic roomId={room.id} />}
        </div>
      </section>

      {/* How to play — a little rules card under the table, tucked away by
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
            How to play Unggoy-Ungguyan
          </p>
          <ChevronDownIcon
            className={`h-4 w-4 text-neutral-400 transition-transform ${guideOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {guideOpen && (
          <ol className="flex flex-col gap-2.5 border-t border-black/5 px-4 py-3.5 text-[13px] leading-snug text-neutral-600 dark:border-white/10 dark:text-neutral-300">
            <Rule n={1}>
              Matching pairs are <b>tossed out automatically</b> — you’ll only ever hold one card
              per rank.
            </Rule>
            <Rule n={2}>
              When it&apos;s your turn, <b>tap any face-down card</b> from the player before you —
              their cards glow when it&apos;s your go.
            </Rule>
            <Rule n={3}>
              Drew a card that makes a pair? That pair gets tossed too. <b>Lose all your cards</b>{' '}
              and you&apos;re safe for the round.
            </Rule>
            <Rule n={4}>
              The <b>Q♠ never finds a match</b> — whoever&apos;s stuck with it last is the unggoy
              and loses. Everyone who made it out earns <b>10 points</b>.
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

// A fanned hand. The viewer's arcs upward from a pivot below the felt so it
// reads like a held hand; an opponent's is the same fan mirrored (`flip`) and
// face-down, like looking at their cards across a real table. Pitch tightens
// as the hand grows so even 20+ cards stay on one row.
function CardFan({
  count,
  codes,
  faceDown = false,
  size = 'md',
  flip = false,
  width = 340,
  tappable = false,
  drawBusy = null,
  onDraw,
}: {
  count?: number
  codes?: CardCode[]
  faceDown?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  flip?: boolean
  /** Approximate horizontal room the fan should fit inside. */
  width?: number
  tappable?: boolean
  drawBusy?: number | null
  onDraw?: (i: number) => void
}) {
  const n = codes?.length ?? count ?? 0
  const mid = (n - 1) / 2
  const cardW = size === 'xs' ? 28 : size === 'sm' ? 40 : size === 'lg' ? 68 : 56
  // Rotation per card caps the fan near ±25°; pitch keeps the row inside the
  // panel instead of wrapping.
  const step = n > 1 ? Math.min(5, 44 / n) : 0
  const pitch = n > 1 ? Math.min(cardW * 0.5, Math.max(4, width / n)) : 0
  return (
    <div
      className={`flex justify-center ${flip ? 'mt-1 items-start pt-2.5' : 'mt-4 items-end pb-2 pt-1'}`}
    >
      {Array.from({ length: n }, (_, i) => (
        <PlayingCard
          key={codes ? codes[i] : i}
          code={codes?.[i]}
          faceDown={faceDown}
          size={size}
          dealStagger={i}
          highlight={tappable && drawBusy !== i}
          onClick={tappable && onDraw ? () => onDraw(i) : undefined}
          style={{
            marginLeft: i === 0 ? 0 : pitch - cardW,
            transform: `rotate(${(flip ? mid - i : i - mid) * step}deg) translateY(${(flip ? -1 : 1) * Math.abs(i - mid) * 1.6}px)`,
            transformOrigin: flip ? '50% -30%' : '50% 130%',
          }}
        />
      ))}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { requestVideokeJoin } from '@/actions/videoke'
import { toast } from '@/lib/events'
import type { VideokeGateData } from '@/lib/videoke'

import { Spinner } from '../Spinner'
import { ChevronLeftIcon, MicIcon } from '../icons'
import { EqBars } from './EqBars'

// The door to a room you're not part of — shown in place of the room when a
// link (notification, activity, lobby) lands here without access. Members
// who left knock to get back in; the host lets them through via the room's
// join requests, which go through the normal invite path.
export function VideokeGate({ roomId, gate }: { roomId: number; gate: VideokeGateData }) {
  const [asked, setAsked] = useState(gate.asked)
  const [pending, startTransition] = useTransition()

  const ask = () => {
    startTransition(async () => {
      const res = await requestVideokeJoin(roomId)
      if (!res.ok) {
        toast(res.error)
        return
      }
      setAsked(true)
    })
  }

  const heading = gate.exists ? (gate.name ?? 'Videoke room') : 'Room not found'
  const message = !gate.exists
    ? 'This room isn’t available anymore.'
    : !gate.open
      ? 'This videoke room has ended.'
      : asked
        ? 'Request sent — the host will let you in when they accept.'
        : gate.canAsk
          ? `This is a private room — ask ${gate.hostName ?? 'the host'} to let you in.`
          : 'This is a private room — only mutuals of the host can ask to join.'

  return (
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
          <h1 className="text-xl font-bold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-neutral-500">{message}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link
              href="/hangouts/videoke"
              className="flex items-center gap-1 rounded-full bg-black/5 px-5 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Back
            </Link>
            {gate.open && gate.canAsk && !asked && (
              <button
                type="button"
                disabled={pending}
                onClick={ask}
                className="btn-primary flex items-center gap-2 rounded-full px-5 py-2 text-sm"
              >
                {pending && <Spinner className="h-4 w-4" />}
                Ask to join
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

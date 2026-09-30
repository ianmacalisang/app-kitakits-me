'use client'

import {
  type LocalAudioTrack,
  type LocalTrackPublication,
  type Participant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/lib/events'

import { MicIcon } from './icons'

const SPEAKER_EVENTS = [
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
]

export interface VoiceTicket {
  token: string
  url: string
  expiresAt: number
}

// Shared "use mic" control for hangout apps (videoke, cards). When the
// deployment has a LiveKit SFU configured this joins the room's voice
// channel via `getTicket`: remote talkers attach as hidden <audio> elements
// and the button publishes/unpublishes the local mic. `canSpeak` is the
// UI-level gate; the SFU enforces the same grant via the token's canPublish.
// Without LiveKit it degrades to a local-only level meter (AnalyserNode →
// RMS, painted via direct style writes so it never re-renders).
export const VoiceMic = memo(function VoiceMic({
  roomId,
  canSpeak,
  getTicket,
  deniedMessage,
  idleLabel,
}: {
  roomId: number
  canSpeak: boolean
  getTicket: (roomId: number) => Promise<VoiceTicket | null>
  /** Toast shown when a non-speaker taps the mic. */
  deniedMessage: string
  /** Passive chip copy for non-speakers when nobody is talking. */
  idleLabel: string
}) {
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voice, setVoice] = useState(false)
  const [speakers, setSpeakers] = useState<string[]>([])
  const lkRef = useRef<Room | null>(null)
  const audioRef = useRef<HTMLDivElement>(null)
  // Set when the meter reads a stream we own (local fallback) — LiveKit tracks
  // are stopped via unpublishTrack instead.
  const ownStreamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const barRef = useRef<HTMLSpanElement>(null)

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    ownStreamRef.current?.getTracks().forEach((t) => t.stop())
    ownStreamRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
  }, [])

  const startMeter = useCallback((stream: MediaStream) => {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    void ctx.resume()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)
    ctxRef.current = ctx
    const buf = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      // RMS → boosted 0..1 level for a readable bar.
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.5)
      if (barRef.current) barRef.current.style.transform = `scaleX(${level})`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // setMicrophoneEnabled(false) only MUTES — the device keeps capturing
  // (stopMicTrackOnMute defaults off). Unpublish + stop actually releases
  // the mic and clears the browser indicator.
  const micOff = useCallback(async () => {
    stopMeter()
    setLive(false)
    const room = lkRef.current
    if (!room) return
    try {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
      if (pub?.track) await room.localParticipant.unpublishTrack(pub.track, true)
    } catch {}
  }, [stopMeter])

  // Names of whoever currently holds the mic — shown to members without
  // publish rights so the transport bar still says who's talking.
  const refreshSpeakers = useCallback(() => {
    const room = lkRef.current
    if (!room) {
      setSpeakers([])
      return
    }
    const hasMic = (p: Participant) => {
      const pub = p.getTrackPublication(Track.Source.Microphone)
      return Boolean(pub?.track && !pub.track.isMuted)
    }
    const names: string[] = []
    if (hasMic(room.localParticipant)) names.push(room.localParticipant.name || 'You')
    for (const p of room.remoteParticipants.values()) {
      if (hasMic(p)) names.push(p.name || 'Someone')
    }
    setSpeakers(names)
  }, [])

  // Join the room's voice channel when LiveKit is configured. Members reach
  // this component only in an open room; the ticket action is the gate.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_LIVEKIT_URL) return
    let cancelled = false
    const room = new Room({ publishDefaults: { stopMicTrackOnMute: true } })
    const onSub = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) audioRef.current?.append(track.attach())
    }
    const onUnsub = (track: RemoteTrack) => track.detach().forEach((el) => el.remove())
    // Server-side permission revoke (or our own unpublish) — clear the meter.
    const onLocalUnpub = (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Microphone) {
        stopMeter()
        setLive(false)
      }
    }
    const onDisc = () => {
      stopMeter()
      setVoice(false)
      setLive(false)
      setSpeakers([])
    }
    room.on(RoomEvent.TrackSubscribed, onSub)
    room.on(RoomEvent.TrackUnsubscribed, onUnsub)
    room.on(RoomEvent.LocalTrackUnpublished, onLocalUnpub)
    room.on(RoomEvent.Disconnected, onDisc)
    for (const ev of SPEAKER_EVENTS) room.on(ev, refreshSpeakers)
    getTicket(roomId)
      .then(async (ticket) => {
        if (!ticket || cancelled) return
        try {
          await room.connect(ticket.url, ticket.token)
          if (cancelled) {
            room.disconnect()
            return
          }
          lkRef.current = room
          setVoice(true)
          refreshSpeakers()
        } catch {
          // Voice service unreachable — the mic stays in local-meter mode.
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
      lkRef.current = null
      room.disconnect()
    }
  }, [roomId, getTicket, stopMeter, refreshSpeakers])

  // Rights changed while our mic was live — the server revokes canPublish
  // too, but release it locally without waiting for the SFU.
  useEffect(() => {
    if (!canSpeak && live) void micOff()
  }, [canSpeak, live, micOff])

  const toggle = async () => {
    if (live) {
      await micOff()
      return
    }
    if (!canSpeak) {
      toast(deniedMessage)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Microphone needs HTTPS or localhost.')
      return
    }
    setBusy(true)
    try {
      let stream: MediaStream | null = null
      if (lkRef.current) {
        // Publish the mic to the room — LiveKit applies echo cancellation /
        // noise suppression by default and hands back the captured track.
        await lkRef.current.localParticipant.setMicrophoneEnabled(true)
        const track = lkRef.current.localParticipant.getTrackPublication(Track.Source.Microphone)
          ?.track as LocalAudioTrack | undefined
        if (track?.mediaStreamTrack) stream = new MediaStream([track.mediaStreamTrack])
      }
      if (!stream) {
        // Local fallback (voice off or not configured) — meter only.
        const local = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        ownStreamRef.current = local
        stream = local
      }
      startMeter(stream)
      setLive(true)
    } catch (e) {
      stopMeter()
      toast(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone access was denied.'
          : deniedMessage,
      )
    } finally {
      setBusy(false)
    }
  }

  useEffect(
    () => () => {
      stopMeter()
    },
    [stopMeter],
  )

  return (
    <div className="flex items-center gap-2.5">
      {/* Remote talkers' audio lives here — attach() returns an <audio> that
          plays immediately once the track is subscribed. */}
      <div ref={audioRef} className="hidden" />
      {live && (
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15">
          <span
            ref={barRef}
            className="block h-full w-full origin-left scale-x-0 rounded-full bg-emerald-400 transition-transform duration-75"
          />
        </span>
      )}
      {canSpeak ? (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-xs font-semibold ring-1 transition disabled:opacity-50 ${
            live
              ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/40 hover:bg-emerald-500/25'
              : 'bg-white/10 text-white ring-white/15 hover:bg-white/20'
          }`}
        >
          <MicIcon className="h-3.5 w-3.5" />
          {live ? 'Mic on' : busy ? 'Mic…' : 'Use mic'}
          {voice && (
            <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-sky-400" title="Voice connected" />
          )}
        </button>
      ) : (
        <span className="flex h-10 items-center gap-1.5 rounded-full bg-white/[0.06] px-4 text-xs font-medium text-white/50 ring-1 ring-white/10">
          <MicIcon className="h-3.5 w-3.5" />
          {speakers.length > 0 ? `${speakers.join(' + ')} on the mic` : idleLabel}
          {voice && (
            <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-sky-400" title="Voice connected" />
          )}
        </span>
      )}
    </div>
  )
})

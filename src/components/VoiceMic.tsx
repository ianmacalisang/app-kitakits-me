'use client'

import {
  type AudioCaptureOptions,
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

// TrackSubscribed/Unsubscribed matter as much as publish events: `pub.track`
// is null until the subscription lands, so refreshing on TrackPublished alone
// misses everyone whose mic was already on when we joined.
const SPEAKER_EVENTS = [
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
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

// Mic capture constraints per use case. LiveKit's defaults enable
// `voiceIsolation` (an experimental ML constraint — adds processing latency
// and gates non-speech audio) and `noiseSuppression`, which chops sustained
// vocals. `music` drops both so singing isn't mangled; `speech` keeps NS for
// table chat. AEC stays on everywhere so speaker output isn't fed back.
export type VoiceAudioProfile = 'speech' | 'music'

const CAPTURE_OPTIONS: Record<VoiceAudioProfile, AudioCaptureOptions> = {
  speech: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    voiceIsolation: false,
  },
  music: {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: true,
    voiceIsolation: false,
  },
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
  audioProfile = 'speech',
  onSpeakers,
}: {
  roomId: number
  canSpeak: boolean
  getTicket: (roomId: number) => Promise<VoiceTicket | null>
  /** Toast shown when a non-speaker taps the mic. */
  deniedMessage: string
  /** Passive chip copy for non-speakers when nobody is talking. */
  idleLabel: string
  /** Mic processing profile — `music` for singing, `speech` for chat. */
  audioProfile?: VoiceAudioProfile
  /** Fires when the set of mic-holding participants changes (user ids) —
      parents use it to badge members who are currently on the mic. */
  onSpeakers?: (ids: number[]) => void
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
  const retriesRef = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSpeakersRef = useRef(onSpeakers)
  const prevMicIdsRef = useRef('')

  useEffect(() => {
    onSpeakersRef.current = onSpeakers
  }, [onSpeakers])

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
  // publish rights so the transport bar still says who's talking. Also
  // reports the ids upward so the room can badge who's live; LiveKit
  // participant identities are the user ids minted into the token's `sub`.
  const refreshSpeakers = useCallback(() => {
    const room = lkRef.current
    const micOf = (p: Participant) => {
      const pub = p.getTrackPublication(Track.Source.Microphone)
      const id = Number(p.identity)
      return pub?.track && !pub.track.isMuted && Number.isFinite(id) ? id : null
    }
    const names: string[] = []
    const ids: number[] = []
    if (room) {
      const selfId = micOf(room.localParticipant)
      if (selfId !== null) {
        ids.push(selfId)
        names.push(room.localParticipant.name || 'You')
      }
      for (const p of room.remoteParticipants.values()) {
        const id = micOf(p)
        if (id !== null) {
          ids.push(id)
          names.push(p.name || 'Someone')
        }
      }
    }
    setSpeakers(names)
    const key = ids.sort((a, b) => a - b).join(',')
    if (key !== prevMicIdsRef.current) {
      prevMicIdsRef.current = key
      onSpeakersRef.current?.(ids)
    }
  }, [])

  // Join the room's voice channel when LiveKit is configured. Members reach
  // this component only in an open room; the ticket action is the gate.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_LIVEKIT_URL) return
    let cancelled = false
    const room = new Room({
      publishDefaults: {
        stopMicTrackOnMute: true,
        // Keep capturing while the publish negotiates so the first
        // syllables after tapping the mic aren't dropped.
        preConnectBuffer: true,
      },
    })
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
    const join = () =>
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
    const onDisc = () => {
      stopMeter()
      setVoice(false)
      setLive(false)
      setSpeakers([])
      if (prevMicIdsRef.current) {
        prevMicIdsRef.current = ''
        onSpeakersRef.current?.([])
      }
      // Voice died without us asking (4h token expiry, exhausted reconnect
      // policy) — rejoin once with a fresh ticket rather than leaving the
      // mic dead until the page reloads.
      if (cancelled || retriesRef.current >= 1) return
      retriesRef.current += 1
      reconnectTimer.current = setTimeout(() => void join(), 1500)
    }
    room.on(RoomEvent.TrackSubscribed, onSub)
    room.on(RoomEvent.TrackUnsubscribed, onUnsub)
    room.on(RoomEvent.LocalTrackUnpublished, onLocalUnpub)
    room.on(RoomEvent.Disconnected, onDisc)
    // Diagnostic for delayed/choppy voice reports — visible in devtools and
    // prod console without affecting UI.
    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      console.debug('[voice] connection quality', participant.identity, quality)
    })
    for (const ev of SPEAKER_EVENTS) room.on(ev, refreshSpeakers)
    void join()
    return () => {
      cancelled = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      lkRef.current = null
      room.disconnect()
      // This control unmounts without the room (e.g. the room ended) —
      // clear the parent's mic badges rather than leaving them stale.
      onSpeakersRef.current?.([])
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
      const capture = CAPTURE_OPTIONS[audioProfile]
      if (lkRef.current) {
        // Publish the mic to the room — AEC is always on so speaker output
        // isn't fed back; `music` drops noise suppression/voice isolation
        // which gate sustained vocals.
        await lkRef.current.localParticipant.setMicrophoneEnabled(true, capture)
        const track = lkRef.current.localParticipant.getTrackPublication(Track.Source.Microphone)
          ?.track as LocalAudioTrack | undefined
        if (track?.mediaStreamTrack) stream = new MediaStream([track.mediaStreamTrack])
      }
      if (!stream) {
        // Local fallback (voice off or not configured) — meter only.
        const local = await navigator.mediaDevices.getUserMedia({ audio: capture })
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

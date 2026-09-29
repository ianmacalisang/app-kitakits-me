'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/lib/events'

import { MicIcon } from '../icons'

// "Use mic" control on the stage transport bar — grants microphone access and
// shows a live input-level meter so the singer can see their voice while they
// perform along to the synced track. Purely local analysis (AnalyserNode →
// RMS); the mic signal is never routed to speakers (feedback risk) or the
// network. The meter is painted via direct style writes, not re-renders.
export const MicMeter = memo(function MicMeter() {
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const barRef = useRef<HTMLSpanElement>(null)

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    setLive(false)
  }, [])

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Microphone needs HTTPS or localhost.')
      return
    }
    setBusy(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) throw new Error('AudioContext unavailable')
      const ctx = new AudioContextCtor()
      void ctx.resume()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      streamRef.current = stream
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
      setLive(true)
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      toast(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone access was denied.'
          : 'No microphone is available on this device.',
      )
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => stop, [stop])

  return (
    <div className="flex items-center gap-2.5">
      {live && (
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15">
          <span
            ref={barRef}
            className="block h-full w-full origin-left scale-x-0 rounded-full bg-emerald-400 transition-transform duration-75"
          />
        </span>
      )}
      <button
        type="button"
        onClick={live ? stop : start}
        disabled={busy}
        className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-xs font-semibold ring-1 transition disabled:opacity-50 ${
          live
            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/40 hover:bg-emerald-500/25'
            : 'bg-white/10 text-white ring-white/15 hover:bg-white/20'
        }`}
      >
        <MicIcon className="h-3.5 w-3.5" />
        {live ? 'Mic on' : busy ? 'Mic…' : 'Use mic'}
      </button>
    </div>
  )
})

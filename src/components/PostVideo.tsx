'use client'

import { memo, useEffect, useRef, useState } from 'react'

import { getVideoStatus, recordVideoPlay } from '@/actions/videos'
import type { PostVideoData } from '@/lib/serialize'

import {
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  VideoIcon,
  VolumeIcon,
  VolumeXIcon,
} from './icons'
import { Spinner } from './Spinner'

const POLL_MS = 5000
const MAX_POLLS = 72 // ~6 minutes, then stop polling
const CONTROLS_HIDE_MS = 2500

// Only one video in the feed plays at a time — starting one pauses the other.
let activeVideo: HTMLVideoElement | null = null

const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

// Plays a Bunny Stream video in the post card. While Bunny transcodes, a
// processing placeholder polls getVideoStatus until the HLS playlist is
// ready. Playback prefers MSE/hls.js (identical everywhere) and falls back
// to native HLS where MSE doesn't exist (iOS/WKWebView).
export const PostVideo = memo(function PostVideo({ video }: { video: PostVideoData }) {
  const [data, setData] = useState(video)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Count one play per watch-through — pause/resume doesn't recount, but a
  // replay after `ended` does.
  const playCountedRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(video.duration ?? 0)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const seekingRef = useRef(false)

  // Pick up a refreshed video prop (e.g. after router.refresh()).
  useEffect(() => setData(video), [video])

  useEffect(() => {
    if (data.status !== 'processing') return
    let cancelled = false
    let polls = 0
    const timer = setInterval(() => {
      if (++polls > MAX_POLLS) {
        clearInterval(timer)
        return
      }
      void getVideoStatus(video.id)
        .then((next) => {
          if (cancelled || !next) return
          setData(next)
          if (next.status !== 'processing') clearInterval(timer)
        })
        // Failed fetches (dev recompile cuts the stream, offline) — retry
        // on the next tick instead of leaking an unhandled rejection.
        .catch(() => {})
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [data.status, video.id])

  useEffect(() => {
    const el = videoRef.current
    if (!el || data.status !== 'ready' || !data.hlsUrl) return

    // Bunny's edge serves .m3u8 pre-compressed and corrupts Range responses
    // on them, so playlists are fetched through our /api/stream proxy which
    // decodes + rewrites them; segments still come straight from Bunny.
    const src = `/api/stream/${data.hlsUrl.replace(/^https?:\/\/[^/]+\//, '')}`

    let hls: import('hls.js').default | undefined
    let cancelled = false
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled || !el.isConnected) return
      // Prefer MSE/hls.js whenever available — it demuxes TS segments
      // itself and behaves identically across browsers. Native HLS is
      // only the fallback for environments without MSE (iOS/WKWebView).
      if (Hls.isSupported()) {
        hls = new Hls()
        hls.on(Hls.Events.ERROR, (_event, details) => {
          console.error(
            '[PostVideo] hls.js error:',
            details.type,
            details.details,
            details.response,
          )
          if (details.fatal) setData((d) => ({ ...d, status: 'failed' }))
        })
        hls.loadSource(src)
        hls.attachMedia(el)
      } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
        el.src = src
      } else {
        console.error('[PostVideo] no HLS support in this browser')
        setData((d) => ({ ...d, status: 'failed' }))
      }
    })
    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [data.status, data.hlsUrl])

  // If this card's video is the active one when it unmounts, release it.
  useEffect(
    () => () => {
      if (activeVideo === videoRef.current) activeVideo = null
    },
    [],
  )

  // Auto-hide the control bar while playing; always visible when paused.
  useEffect(() => {
    if (!playing || !showControls) return
    const t = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS)
    return () => clearTimeout(t)
  }, [playing, showControls])

  // Track fullscreen so the fixed-height container can expand.
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const handlePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (activeVideo && activeVideo !== el) activeVideo.pause()
    activeVideo = el
    setPlaying(true)
    if (!playCountedRef.current) {
      playCountedRef.current = true
      void recordVideoPlay(video.id)
        .then(({ playCount }) => {
          if (playCount !== undefined) setData((d) => ({ ...d, playCount }))
        })
        .catch(() => {})
    }
  }

  const handlePause = () => {
    if (activeVideo === videoRef.current) activeVideo = null
    setPlaying(false)
  }

  const handleEnded = () => {
    handlePause()
    playCountedRef.current = false
  }

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  const toggleMute = () => {
    const el = videoRef.current
    if (el) el.muted = !el.muted
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void containerRef.current?.requestFullscreen()
  }

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = videoRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * duration
    setCurrentTime(el.currentTime)
  }

  const ready = data.status === 'ready'

  return (
    <div
      ref={containerRef}
      onPointerMove={() => setShowControls(true)}
      className={`relative mt-3 w-full overflow-hidden border border-black/5 bg-neutral-950 ${
        fullscreen ? 'h-full rounded-none' : 'h-[260px] rounded-2xl sm:h-[420px]'
      } ${ready && playing && !showControls ? 'cursor-none' : ''}`}
    >
      {/* Blurred thumbnail backdrop — fills the letterbox space for portrait
          or odd-aspect videos instead of plain black bars. */}
      {data.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.thumbnailUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl"
        />
      )}
      {ready ? (
        <>
          <video
            ref={videoRef}
            playsInline
            preload="metadata"
            poster={data.thumbnailUrl || undefined}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onClick={togglePlay}
            onTimeUpdate={(e) => {
              if (!seekingRef.current) setCurrentTime(e.currentTarget.currentTime)
            }}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onError={() => {
              const err = videoRef.current?.error
              console.error('[PostVideo] media error:', err?.code, err?.message)
            }}
            className="relative h-full w-full object-contain"
          />

          {/* Center affordance — big play button when paused, spinner while
              buffering. Clicking anywhere on the video also toggles. */}
          {buffering ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
                <Spinner className="h-6 w-6 text-white" />
              </span>
            </span>
          ) : (
            !playing && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play video"
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-md transition-transform hover:scale-105 active:scale-95">
                  <PlayIcon className="ml-1 h-7 w-7 text-white" />
                </span>
              </button>
            )
          )}

          {/* Bottom control bar — gradient scrim + seek + transport */}
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-200 ${
              showControls || !playing ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            {/* Seek bar */}
            <div
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              className="group/seek relative flex h-4 cursor-pointer items-center"
              onPointerDown={(e) => {
                seekingRef.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
                seek(e)
              }}
              onPointerMove={(e) => {
                if (seekingRef.current) seek(e)
              }}
              onPointerUp={() => {
                seekingRef.current = false
              }}
            >
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/25 transition-all group-hover/seek:h-1.5">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <div
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-emerald-300 opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
                style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-white">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? 'Pause' : 'Play'}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/15"
              >
                {playing ? (
                  <PauseIcon className="h-4.5 w-4.5" />
                ) : (
                  <PlayIcon className="h-4.5 w-4.5" />
                )}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/15"
              >
                {muted ? (
                  <VolumeXIcon className="h-4.5 w-4.5" />
                ) : (
                  <VolumeIcon className="h-4.5 w-4.5" />
                )}
              </button>
              <span className="text-[11px] font-medium tabular-nums text-white/85">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/15"
              >
                {fullscreen ? (
                  <MinimizeIcon className="h-4.5 w-4.5" />
                ) : (
                  <MaximizeIcon className="h-4.5 w-4.5" />
                )}
              </button>
            </div>
          </div>
        </>
      ) : data.status === 'processing' ? (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden">
          {/* Breathing emerald wash behind the icon */}
          <div className="absolute -inset-10 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.22),rgba(13,148,136,0.1)_45%,transparent_70%)] motion-safe:animate-processing-glow" />

          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-md">
            <VideoIcon className="h-6 w-6 text-emerald-300" />
          </span>
          <div className="relative flex flex-col items-center gap-0.5 px-4 text-center">
            <span className="text-[13px] font-medium text-white">Processing video…</span>
            <span className="text-[11px] text-white/50">
              It&apos;ll start playing here once it&apos;s ready
            </span>
          </div>

          {/* Indeterminate sweep — Bunny doesn't report encode progress */}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 motion-safe:animate-processing-sweep" />
          </div>
        </div>
      ) : (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-400">
          <VideoIcon className="h-6 w-6" />
          <span className="text-xs">Video unavailable</span>
        </div>
      )}
      {ready && data.playCount > 0 && (
        <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          <PlayIcon className="h-3 w-3" />
          {data.playCount} {data.playCount === 1 ? 'play' : 'plays'}
        </span>
      )}
    </div>
  )
})

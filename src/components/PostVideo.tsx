'use client'

import { memo, useEffect, useRef, useState } from 'react'

import { getVideoStatus, recordVideoPlay } from '@/actions/videos'
import type { PostVideoData } from '@/lib/serialize'

import { PlayIcon, VideoIcon } from './icons'

const POLL_MS = 5000
const MAX_POLLS = 72 // ~6 minutes, then stop polling

// Only one video in the feed plays at a time — starting one pauses the other.
let activeVideo: HTMLVideoElement | null = null

// Plays a Bunny Stream video in the post card. While Bunny transcodes, a
// processing placeholder polls getVideoStatus until the HLS playlist is
// ready. Playback uses native HLS where available (Safari/iOS) and lazy-loaded
// hls.js elsewhere, so the library stays out of the initial bundle.
export const PostVideo = memo(function PostVideo({ video }: { video: PostVideoData }) {
  const [data, setData] = useState(video)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Count one play per watch-through — pause/resume doesn't recount, but a
  // replay after `ended` does.
  const playCountedRef = useRef(false)

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
      void getVideoStatus(video.id).then((next) => {
        if (cancelled || !next) return
        setData(next)
        if (next.status !== 'processing') clearInterval(timer)
      })
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [data.status, video.id])

  useEffect(() => {
    const el = videoRef.current
    if (!el || data.status !== 'ready' || !data.hlsUrl) return

    // Safari/iOS decode HLS natively — just hand them the playlist.
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = data.hlsUrl
      return
    }

    let hls: import('hls.js').default | undefined
    let cancelled = false
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled || !el.isConnected || !Hls.isSupported()) return
      hls = new Hls()
      hls.loadSource(data.hlsUrl)
      hls.attachMedia(el)
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

  const handlePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (activeVideo && activeVideo !== el) activeVideo.pause()
    activeVideo = el
    if (!playCountedRef.current) {
      playCountedRef.current = true
      void recordVideoPlay(video.id).then(({ playCount }) => {
        if (playCount !== undefined) setData((d) => ({ ...d, playCount }))
      })
    }
  }

  const handlePause = () => {
    if (activeVideo === videoRef.current) activeVideo = null
  }

  const handleEnded = () => {
    handlePause()
    playCountedRef.current = false
  }

  return (
    <div className="relative mt-3 h-[260px] w-full overflow-hidden rounded-2xl border border-black/5 bg-neutral-950 sm:h-[420px]">
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
      {data.status === 'ready' ? (
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          poster={data.thumbnailUrl || undefined}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          className="relative h-full w-full object-contain"
        />
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
      {data.status === 'ready' && data.playCount > 0 && (
        <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          <PlayIcon className="h-3 w-3" />
          {data.playCount} {data.playCount === 1 ? 'play' : 'plays'}
        </span>
      )}
    </div>
  )
})

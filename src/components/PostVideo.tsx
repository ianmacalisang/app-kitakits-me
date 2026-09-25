'use client'

import { memo, useEffect, useRef, useState } from 'react'

import { getVideoStatus } from '@/actions/videos'
import type { PostVideoData } from '@/lib/serialize'

import { VideoIcon } from './icons'

const POLL_MS = 5000
const MAX_POLLS = 72 // ~6 minutes, then stop polling

// Plays a Bunny Stream video in the post card. While Bunny transcodes, a
// processing placeholder polls getVideoStatus until the HLS playlist is
// ready. Playback uses native HLS where available (Safari/iOS) and lazy-loaded
// hls.js elsewhere, so the library stays out of the initial bundle.
export const PostVideo = memo(function PostVideo({ video }: { video: PostVideoData }) {
  const [data, setData] = useState(video)
  const videoRef = useRef<HTMLVideoElement>(null)

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

  return (
    <div
      className="mt-3 overflow-hidden rounded-2xl border border-black/5 bg-neutral-950"
      style={{ aspectRatio: String(data.aspectRatio ?? 16 / 9) }}
    >
      {data.status === 'ready' ? (
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          poster={data.thumbnailUrl || undefined}
          className="h-full w-full"
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
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-500">
          <VideoIcon className="h-6 w-6" />
          <span className="text-xs">Video unavailable</span>
        </div>
      )}
    </div>
  )
})

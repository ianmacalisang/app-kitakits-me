'use client'

import { memo, useEffect, useRef, useState } from 'react'

import { getVideoStatus } from '@/actions/videos'
import type { PostVideoData } from '@/lib/serialize'

import { Spinner } from './Spinner'

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
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-300">
          <Spinner className="h-6 w-6" />
          <span className="text-xs">Processing video…</span>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
          Video unavailable
        </div>
      )}
    </div>
  )
})

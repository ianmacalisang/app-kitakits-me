'use client'

import {
  memo,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export interface VideokePlayerHandle {
  /** Current playback position in seconds — host reports it on pause. */
  getTime: () => number
  /** Unmute + ensure playback — call from a real user gesture (autoplay policy). */
  unlockAudio: () => void
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayerLike
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface YTPlayerLike {
  loadVideoById: (args: { videoId: string; startSeconds?: number }) => void
  playVideo: () => void
  pauseVideo: () => void
  stopVideo: () => void
  seekTo: (sec: number, allowSeekAhead?: boolean) => void
  getCurrentTime: () => number
  getVideoData: () => { video_id?: string }
  unMute: () => void
  setVolume: (v: number) => void
  destroy?: () => void
}

// IFrame API loads once per page; later players share the promise.
let ytApi: Promise<NonNullable<Window['YT']>> | null = null

const loadYouTube = (): Promise<NonNullable<Window['YT']>> => {
  ytApi ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (window.YT) resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApi
}

const DRIFT_TOLERANCE = 2.5

interface DesiredPlayback {
  videoId: string | null
  playing: boolean
  positionSec: number
  startedAt: string | null
  serverNow: number
  // Client clock when this snapshot arrived — the server position is
  // projected forward by the snapshot's age, and since serverNow and
  // startedAt share the server clock, skew cancels out entirely.
  receivedAt: number
}

// Synced YouTube player for the videoke room. Starts muted-autoplay (allowed
// by autoplay policy) so the video is visibly rolling; the room's overlay
// calls unlockAudio() on the user's first tap. The desired position is
// derived inside callbacks/effects — never during render — as
// positionSec + (projected serverNow - startedAt), and only applied
// when drift exceeds the tolerance so routine refreshes never skip.
export const YouTubePlayer = memo(function YouTubePlayer({
  ref,
  videoId,
  playing,
  positionSec,
  startedAt,
  serverNow,
  interactive = false,
  onEnded,
  onUserPlay,
  onUserPause,
}: Omit<DesiredPlayback, 'receivedAt'> & {
  ref?: Ref<VideokePlayerHandle>
  // Pointer events on the iframe — only enabled for the host, whose clicks
  // are reported back through onUserPlay/onUserPause.
  interactive?: boolean
  onEnded?: () => void
  onUserPlay?: () => void
  onUserPause?: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayerLike | null>(null)
  const [ready, setReady] = useState(false)
  const desired = useRef<DesiredPlayback | null>(null)
  const onEndedRef = useRef(onEnded)
  const onUserPlayRef = useRef(onUserPlay)
  const onUserPauseRef = useRef(onUserPause)
  // Player callbacks below the mount effect must not act on the autoplay
  // burst that precedes the first apply() — only user clicks after sync.
  const appliedOnceRef = useRef(false)
  // The video id this player saw ENDED — playVideo() on an ended video would
  // restart it from 0, and members must sit out until the room advances.
  const endedVideoRef = useRef<string | null>(null)

  useEffect(() => {
    const prev = desired.current
    // Only stamp a fresh receipt time when the snapshot actually changed —
    // no-op re-renders must keep the original so the projection stays honest.
    const fresh =
      !prev ||
      prev.videoId !== videoId ||
      prev.playing !== playing ||
      prev.positionSec !== positionSec ||
      prev.startedAt !== startedAt ||
      prev.serverNow !== serverNow
    desired.current = {
      videoId,
      playing,
      positionSec,
      startedAt,
      serverNow,
      receivedAt: fresh ? Date.now() : prev.receivedAt,
    }
  })
  useEffect(() => {
    onEndedRef.current = onEnded
    onUserPlayRef.current = onUserPlay
    onUserPauseRef.current = onUserPause
  })

  const apply = useCallback(() => {
    const p = playerRef.current
    const d = desired.current
    if (!p || !d) return
    appliedOnceRef.current = true
    try {
      if (!d.videoId) {
        p.stopVideo()
        return
      }
      const nowServer = d.serverNow + (Date.now() - d.receivedAt)
      const elapsed = d.playing && d.startedAt ? (nowServer - Date.parse(d.startedAt)) / 1000 : 0
      const target = Math.max(0, d.positionSec + Math.max(0, elapsed))

      if (p.getVideoData?.().video_id !== d.videoId) {
        p.loadVideoById({ videoId: d.videoId, startSeconds: target })
        return
      }
      const cur = p.getCurrentTime?.() ?? 0
      if (Math.abs(cur - target) > DRIFT_TOLERANCE) p.seekTo(target, true)
      if (d.playing) {
        if (endedVideoRef.current !== d.videoId) p.playVideo()
      } else {
        p.pauseVideo()
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (ready) apply()
  }, [ready, apply, videoId, playing, positionSec, startedAt, serverNow])

  // Periodic drift correction while a song is supposedly playing — covers
  // buffering stalls and tab throttling between room refreshes.
  useEffect(() => {
    if (!ready || !playing) return
    const id = setInterval(apply, 5_000)
    return () => clearInterval(id)
  }, [ready, playing, apply])

  useEffect(() => {
    let cancelled = false
    void loadYouTube().then((YT) => {
      if (cancelled || !hostRef.current) return
      playerRef.current = new YT.Player(hostRef.current, {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          mute: 1,
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            if (!cancelled) setReady(true)
          },
          onStateChange: (e: { data?: number }) => {
            const d = desired.current
            if (e?.data === YT.PlayerState.ENDED) {
              endedVideoRef.current = d?.videoId ?? null
              // Kill YouTube's endscreen suggestion grid — the next song
              // replaces the video anyway, and an idle room shows the poster
              // frame instead of a wall of links.
              try {
                playerRef.current?.stopVideo()
              } catch {}
              onEndedRef.current?.()
            } else if (!appliedOnceRef.current || !d?.videoId) {
              return
            } else if (e?.data === YT.PlayerState.PLAYING && !d.playing) {
              // State contradicts the desired room state — a user click on
              // the iframe (playVideo/pauseVideo calls always match desired).
              onUserPlayRef.current?.()
            } else if (e?.data === YT.PlayerState.PAUSED && d.playing) {
              onUserPauseRef.current?.()
            }
          },
        },
      })
    })
    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy?.()
      } catch {}
      playerRef.current = null
      setReady(false)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    getTime: () => {
      try {
        return playerRef.current?.getCurrentTime?.() ?? 0
      } catch {
        return 0
      }
    },
    unlockAudio: () => {
      try {
        const p = playerRef.current
        const d = desired.current
        p?.unMute()
        p?.setVolume(100)
        if (d?.playing && d.videoId) p?.playVideo()
      } catch {}
    },
  }))

  return (
    <div
      ref={hostRef}
      className={`h-full w-full [&_iframe]:h-full [&_iframe]:w-full ${
        interactive ? '' : '[&_iframe]:pointer-events-none'
      }`}
    />
  )
})

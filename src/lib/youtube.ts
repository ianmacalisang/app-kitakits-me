// YouTube Data API v3 helpers for the videoke song picker. Searches are
// scoped to a single karaoke channel — the handle resolves to a channelId
// once per process and is cached (channelId lookups are the cheapest call,
// but every search.list call costs 100 quota units, so callers must be
// conservative and rate-limit upstream).
//
// Env:
//   YOUTUBE_API_KEY          Data API v3 key — search is disabled without it
//   YOUTUBE_KARAOKE_CHANNEL  Channel handle to scope songs to (default @AtomicKaraoke)
//   YOUTUBE_API_REFERER      Referer header for server-side calls — needed when
//                            the key is HTTP-referrer restricted (browser key)

const API = 'https://www.googleapis.com/youtube/v3'
const API_KEY = process.env.YOUTUBE_API_KEY ?? ''
const CHANNEL_HANDLE = process.env.YOUTUBE_KARAOKE_CHANNEL ?? '@AtomicKaraoke'
const REFERER = process.env.YOUTUBE_API_REFERER ?? ''
const VIDEO_ID_RE = /^[\w-]{11}$/

const ytHeaders = () => (REFERER ? { Referer: REFERER } : undefined)

export interface YoutubeSong {
  videoId: string
  title: string
  thumbnail: string
  durationSec: number | null
}

export const youtubeConfigured = () => Boolean(API_KEY)

let channelIdPromise: Promise<string | null> | null = null

export function resolveChannelId(): Promise<string | null> {
  if (!API_KEY) return Promise.resolve(null)
  channelIdPromise ??= (async () => {
    try {
      const res = await fetch(
        `${API}/channels?part=id&forHandle=${encodeURIComponent(CHANNEL_HANDLE)}&key=${API_KEY}`,
        { headers: ytHeaders() },
      )
      if (res.ok) {
        const id = (await res.json())?.items?.[0]?.id
        if (typeof id === 'string') return id
      }
    } catch {}
    // Only successful resolutions are cached — a transient failure or a late
    // env fix must not brick search until the process restarts.
    channelIdPromise = null
    return null
  })()
  return channelIdPromise
}

// API titles/descriptions arrive HTML-entity-encoded.
const decodeEntities = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const pickThumb = (thumbs: Record<string, { url?: string }> | undefined) =>
  thumbs?.medium?.url ?? thumbs?.high?.url ?? thumbs?.default?.url ?? ''

// ISO-8601 durations ("PT4M32S") → seconds.
const parseDuration = (iso: unknown): number | null => {
  if (typeof iso !== 'string') return null
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  return (Number(m[1] ?? 0) * 3600 || 0) + (Number(m[2] ?? 0) * 60 || 0) + (Number(m[3] ?? 0) || 0)
}

const durationsOf = async (ids: string[]): Promise<Map<string, number>> => {
  const map = new Map<string, number>()
  if (ids.length === 0 || !API_KEY) return map
  try {
    const res = await fetch(
      `${API}/videos?part=contentDetails&id=${ids.join(',')}&key=${API_KEY}`,
      {
        headers: ytHeaders(),
      },
    )
    if (!res.ok) return map
    const data = await res.json()
    for (const item of data?.items ?? []) {
      const sec = parseDuration(item?.contentDetails?.duration)
      if (typeof item?.id === 'string' && sec != null) map.set(item.id, sec)
    }
  } catch {}
  return map
}

// Channel-scoped video search. Returns [] when unconfigured or the channel
// can't be resolved — callers translate that into a user-facing message.
export async function searchChannelVideos(query: string, limit = 15): Promise<YoutubeSong[]> {
  const q = query.trim().slice(0, 100)
  if (!q) return []
  const channelId = await resolveChannelId()
  if (!channelId) return []
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      channelId,
      q,
      type: 'video',
      maxResults: String(Math.min(Math.max(limit, 1), 25)),
      key: API_KEY,
    })
    const res = await fetch(`${API}/search?${params}`, { headers: ytHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    const items = (data?.items ?? []) as {
      id?: { videoId?: string }
      snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> }
    }[]
    const ids = items.map((i) => i.id?.videoId).filter((v): v is string => Boolean(v))
    const durations = await durationsOf(ids)
    return items
      .filter((i) => i.id?.videoId && i.snippet?.title)
      .map((i) => ({
        videoId: i.id!.videoId!,
        title: decodeEntities(String(i.snippet!.title)).slice(0, 300),
        thumbnail: pickThumb(i.snippet!.thumbnails),
        durationSec: durations.get(i.id!.videoId!) ?? null,
      }))
  } catch {
    return []
  }
}

// Resolve a videoId back to a song, confirming it belongs to the karaoke
// channel — guards queue adds so an arbitrary YouTube id can't be injected.
export async function getChannelVideo(videoId: string): Promise<YoutubeSong | null> {
  if (!VIDEO_ID_RE.test(videoId)) return null
  const channelId = await resolveChannelId()
  if (!channelId) return null
  try {
    const res = await fetch(
      `${API}/videos?part=snippet,contentDetails&id=${videoId}&key=${API_KEY}`,
      { headers: ytHeaders() },
    )
    if (!res.ok) return null
    const item = (await res.json())?.items?.[0]
    if (!item || item.snippet?.channelId !== channelId) return null
    return {
      videoId,
      title: decodeEntities(String(item.snippet?.title ?? '')).slice(0, 300),
      thumbnail: pickThumb(item.snippet?.thumbnails),
      durationSec: parseDuration(item.contentDetails?.duration),
    }
  } catch {
    return null
  }
}

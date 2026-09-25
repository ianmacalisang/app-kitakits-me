import { createHash } from 'crypto'

// Bunny Stream — video files upload straight from the browser via TUS; these
// helpers only ever run server-side (server actions, hooks, route handlers)
// so the API key stays off the client. Playback/thumbnail URLs are derived
// from the video guid and the stream pull-zone hostname.

const API_BASE = 'https://video.bunnycdn.com'
export const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload'

// Bunny API calls have no built-in deadline — a stalled request would hang
// the server action until the client gives up (and Chrome logs the cut
// stream as ERR_CONTENT_DECODING_FAILED). Bound them all.
const API_TIMEOUT_MS = 10_000

const libraryId = () => process.env.BUNNY_STREAM_LIBRARY_ID ?? ''
const apiKey = () => process.env.BUNNY_STREAM_API_KEY ?? ''

export const streamHostname = () => {
  const host = process.env.BUNNY_STREAM_HOSTNAME?.replace(/\/+$/, '') ?? ''
  return host && !host.startsWith('http') ? `https://${host}` : host
}

export const bunnyStreamConfigured = () => Boolean(libraryId() && apiKey() && streamHostname())

// TUS presigned upload — signature = sha256(libraryId + apiKey + expiry + videoId)
// per Bunny's direct-upload auth, letting the browser PUT without the API key.
export function tusUploadAuth(videoGuid: string): { signature: string; expires: number } {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 // 1 hour
  const signature = createHash('sha256')
    .update(libraryId() + apiKey() + expires + videoGuid)
    .digest('hex')
  return { signature, expires }
}

export async function createStreamVideo(title: string): Promise<string> {
  const res = await fetch(`${API_BASE}/library/${libraryId()}/videos`, {
    method: 'POST',
    headers: { AccessKey: apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.slice(0, 200) || 'video' }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Bunny video create failed (${res.status})`)
  const json = (await res.json()) as { guid?: string }
  if (!json.guid) throw new Error('Bunny video create returned no guid')
  return json.guid
}

export interface StreamVideoInfo {
  status: number
  duration: number | null
  width: number | null
  height: number | null
}

export async function fetchStreamVideo(guid: string): Promise<StreamVideoInfo | null> {
  const res = await fetch(`${API_BASE}/library/${libraryId()}/videos/${guid}`, {
    headers: { AccessKey: apiKey() },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  if (!res.ok) return null
  const json = (await res.json()) as {
    status?: number
    length?: number
    width?: number
    height?: number
  }
  return {
    status: json.status ?? -1,
    duration: json.length ?? null,
    width: json.width ?? null,
    height: json.height ?? null,
  }
}

export async function deleteStreamVideo(guid: string): Promise<void> {
  await fetch(`${API_BASE}/library/${libraryId()}/videos/${guid}`, {
    method: 'DELETE',
    headers: { AccessKey: apiKey() },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
}

// Deterministic URLs on the stream pull zone — valid once encoding finishes.
export function streamUrls(guid: string): { hlsUrl: string; thumbnailUrl: string } {
  const host = streamHostname()
  return {
    hlsUrl: host ? `${host}/${guid}/playlist.m3u8` : '',
    thumbnailUrl: host ? `${host}/${guid}/thumbnail.jpg` : '',
  }
}

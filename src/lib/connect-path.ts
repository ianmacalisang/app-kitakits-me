// Client-safe helpers for the scan-to-connect flow — no Node or Payload
// imports, so components can use them for validating scanned links too.

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/

export const connectPath = (username: string) => `/connect/${username}`

// Accepts only in-app connect paths — anything else (external URLs, other
// routes) returns null, so `next` params can't become open redirects and the
// scanner can't be tricked into navigating off-app.
export const safeConnectPath = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  return /^\/connect\/[a-zA-Z0-9_]{3,30}$/.test(value) ? value : null
}

// Turns a raw decoded QR payload into a same-origin connect path, or null.
// Relative paths resolve against `origin`; foreign URLs are rejected.
export const connectPathFromUrl = (raw: string, origin: string): string | null => {
  try {
    const url = new URL(raw, origin)
    if (url.origin !== origin) return null
    return safeConnectPath(url.pathname)
  } catch {
    return null
  }
}

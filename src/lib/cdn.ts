export function toCdnUrl(url?: string | null): string | undefined {
  if (!url) return undefined

  const cdn = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/+$/, '')
  if (!cdn) return url

  // Media URLs from Payload are app-relative (e.g. /api/media/file/x.jpg);
  // route those through the CDN. Absolute/external URLs are left untouched.
  if (url.startsWith('/')) return `${cdn}${url}`

  return url
}

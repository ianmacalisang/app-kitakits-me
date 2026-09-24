export interface EmbedInfo {
  provider: string
  embedUrl: string
  // Tailwind sizing class for the iframe — vertical providers get tall frames.
  frameClass: string
}

// Recognizes common providers and returns a safe iframe URL. Only whitelisted
// providers get embeds; anything else returns null and renders as a link card.
export function getEmbed(url: string): EmbedInfo | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    const host = u.hostname.replace(/^(www|m)\./, '')

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      if (id) return video('YouTube', `https://www.youtube.com/embed/${id}`)
    }
    if (host === 'youtube.com') {
      const id =
        u.searchParams.get('v') ??
        u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/)?.[2]
      if (id) return video('YouTube', `https://www.youtube.com/embed/${id}`)
    }
    if (host === 'open.spotify.com') {
      const m = u.pathname.match(/^\/(track|album|playlist|episode|show)\/(\w+)/)
      if (m)
        return {
          provider: 'Spotify',
          embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
          frameClass: 'h-[152px]',
        }
    }
    if (host === 'tiktok.com') {
      const id = u.pathname.match(/\/video\/(\d+)/)?.[1]
      if (id)
        return {
          provider: 'TikTok',
          embedUrl: `https://www.tiktok.com/embed/v2/${id}`,
          frameClass: 'h-[580px]',
        }
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.match(/^\/(\d+)/)?.[1]
      if (id) return video('Vimeo', `https://player.vimeo.com/video/${id}`)
    }
    if (host === 'instagram.com') {
      const m = u.pathname.match(/^\/(p|reel|reels)\/([\w-]+)/)
      if (m)
        return {
          provider: 'Instagram',
          embedUrl: `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed`,
          frameClass: 'h-[480px]',
        }
    }
    return null
  } catch {
    return null
  }
}

const video = (provider: string, embedUrl: string): EmbedInfo => ({
  provider,
  embedUrl,
  frameClass: 'aspect-video',
})

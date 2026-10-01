'use client'

import { useState } from 'react'

import { toast } from '@/lib/events'

import { Avatar } from './Avatar'
import { DownloadIcon, ScanIcon, ShareIcon } from './icons'
import { Spinner } from './Spinner'

const loadImage = (src: string, crossOrigin?: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = crossOrigin
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

// Canvas reads need CORS-clean pixels. Try the CDN directly as an
// anonymous CORS request; when the host doesn't allow it, retry through
// the same-origin media proxy so the canvas stays untainted.
const loadCanvasImage = (src?: string): Promise<HTMLImageElement> => {
  if (!src) return Promise.reject(new Error('no image'))
  if (!/^https?:\/\//.test(src)) return loadImage(src)
  return loadImage(src, 'anonymous').catch(() =>
    loadImage(`/api/media-proxy?url=${encodeURIComponent(src)}`),
  )
}

const traceRoundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Resolve a --color-* token to a canvas-usable color. getComputedStyle
// serializes oklch tokens to a painted color, which every canvas accepts.
const cssColor = (token: string, fallback: string) => {
  const el = document.createElement('div')
  el.style.color = `var(--color-${token})`
  el.style.position = 'absolute'
  el.style.opacity = '0'
  document.body.appendChild(el)
  const value = getComputedStyle(el).color
  el.remove()
  return value || fallback
}

// Composes the downloadable card on canvas — mirrors the on-screen ticket:
// dark accent panel (cover photo dimmed underneath when set), avatar
// straddling the top edge, name + handle, white QR tile with the app mark at
// its center, and the dashed perforation footer. CDN images fall back
// gracefully if they can't be read cross-origin.
const renderCard = async (
  canvas: HTMLCanvasElement,
  {
    qrDataUrl,
    name,
    username,
    avatarUrl,
    coverUrl,
    appName,
    logoUrl,
  }: {
    qrDataUrl: string
    name: string
    username: string
    avatarUrl?: string
    coverUrl?: string
    appName: string
    logoUrl?: string
  },
) => {
  const W = 1080
  const H = 1350
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  const accent = (t: string, fb: string) => cssColor(t, fb)
  const a700 = accent('accent-700', '#a3561d')
  const a800 = accent('accent-800', '#7c3e16')
  const a950 = accent('accent-950', '#321c0b')
  const a500 = accent('accent-500', '#c2622a')
  const a600 = accent('accent-600', '#a8521f')

  const cx = W / 2
  const card = { x: 90, y: 170, w: 900, h: 1090, r: 56 }

  // Page background — soft neutral, matching the app shell.
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#fafafa')
  bg.addColorStop(1, '#e9e9e9')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Card panel — accent gradient, cover photo dimmed underneath when set.
  ctx.save()
  traceRoundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.clip()
  const panel = ctx.createLinearGradient(0, card.y, 0, card.y + card.h)
  panel.addColorStop(0, a700)
  panel.addColorStop(0.5, a800)
  panel.addColorStop(1, a950)
  ctx.fillStyle = panel
  ctx.fillRect(card.x, card.y, card.w, card.h)

  try {
    const cover = await loadCanvasImage(coverUrl)
    const s = Math.max(card.w / cover.width, card.h / cover.height)
    ctx.drawImage(
      cover,
      card.x + (card.w - cover.width * s) / 2,
      card.y + (card.h - cover.height * s) / 2,
      cover.width * s,
      cover.height * s,
    )
    ctx.fillStyle = a950
    ctx.globalAlpha = 0.65
    ctx.fillRect(card.x, card.y, card.w, card.h)
    ctx.globalAlpha = 1
  } catch {
    /* gradient-only card */
  }

  // Ambient highlight — white sheen across the top of the panel.
  const sheen = ctx.createLinearGradient(0, card.y, 0, card.y + 180)
  sheen.addColorStop(0, 'rgba(255,255,255,0.15)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(card.x, card.y, card.w, 180)
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  traceRoundRect(ctx, card.x, card.y, card.w, card.h, card.r)
  ctx.stroke()

  // Avatar straddling the card's top edge — white ring behind the photo.
  ctx.beginPath()
  ctx.arc(cx, card.y, 92, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  try {
    const img = await loadCanvasImage(avatarUrl)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, card.y, 80, 0, Math.PI * 2)
    ctx.clip()
    const s = Math.max(160 / img.width, 160 / img.height)
    ctx.drawImage(
      img,
      cx - (img.width * s) / 2,
      card.y - (img.height * s) / 2,
      img.width * s,
      img.height * s,
    )
    ctx.restore()
  } catch {
    const g = ctx.createLinearGradient(cx - 80, card.y - 80, cx + 80, card.y + 80)
    g.addColorStop(0, '#404040')
    g.addColorStop(1, '#141414')
    ctx.beginPath()
    ctx.arc(cx, card.y, 80, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 60px Poppins, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name.charAt(0).toUpperCase(), cx, card.y + 4)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 56px Poppins, Arial, sans-serif'
  ctx.fillText(name.length > 22 ? `${name.slice(0, 21)}…` : name, cx, card.y + 170)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '400 34px Poppins, Arial, sans-serif'
  ctx.fillText(`@${username}`, cx, card.y + 224)

  // White QR tile.
  const tile = { x: cx - 280, y: card.y + 280, s: 560 }
  traceRoundRect(ctx, tile.x, tile.y, tile.s, tile.s, 36)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = 2
  ctx.stroke()
  const qr = await loadImage(qrDataUrl)
  ctx.drawImage(qr, tile.x + 28, tile.y + 28, tile.s - 56, tile.s - 56)

  // App mark centered on the QR — white pad + logo (or the gradient letter
  // tile). 'H' error correction keeps the code readable under the overlay.
  traceRoundRect(ctx, cx - 66, tile.y + tile.s / 2 - 66, 132, 132, 30)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 2
  ctx.stroke()
  try {
    const logo = await loadCanvasImage(logoUrl)
    const s = Math.min(92 / logo.width, 92 / logo.height)
    ctx.drawImage(
      logo,
      cx - (logo.width * s) / 2,
      tile.y + tile.s / 2 - (logo.height * s) / 2,
      logo.width * s,
      logo.height * s,
    )
  } catch {
    traceRoundRect(ctx, cx - 46, tile.y + tile.s / 2 - 46, 92, 92, 24)
    const lg = ctx.createLinearGradient(
      cx - 46,
      tile.y + tile.s / 2 - 46,
      cx + 46,
      tile.y + tile.s / 2 + 46,
    )
    lg.addColorStop(0, a500)
    lg.addColorStop(0.5, a600)
    lg.addColorStop(1, a800)
    ctx.fillStyle = lg
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 52px Poppins, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(appName.charAt(0).toUpperCase(), cx, tile.y + tile.s / 2 + 4)
  }

  // Caption under the tile.
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '400 30px Poppins, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Scan to connect — no login needed', cx, tile.y + tile.s + 66)

  // Ticket perforation — dashed rule flanking the tagline.
  const tag = 'SCAN · FOLLOW · CONNECT'
  ctx.font = '500 24px Poppins, Arial, sans-serif'
  ctx.letterSpacing = '5px'
  const tagW = ctx.measureText(tag).width
  const py = tile.y + tile.s + 140
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText(tag, cx, py + 9)
  ctx.letterSpacing = '0px'
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 9])
  ctx.beginPath()
  ctx.moveTo(card.x + 40, py)
  ctx.lineTo(cx - tagW / 2 - 30, py)
  ctx.moveTo(cx + tagW / 2 + 30, py)
  ctx.lineTo(card.x + card.w - 40, py)
  ctx.stroke()
  ctx.setLineDash([])

  return true
}

// The /invite page card — QR, owner identity, download + share actions.
export function QrCard({
  qrDataUrl,
  connectUrl,
  name,
  username,
  avatarUrl,
  coverUrl,
  appName,
  logoUrl,
}: {
  qrDataUrl: string
  connectUrl: string
  name: string
  username: string
  avatarUrl?: string
  coverUrl?: string
  appName: string
  logoUrl?: string
}) {
  const [downloading, setDownloading] = useState(false)

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Connect with ${name} on ${appName}`, url: connectUrl })
      } catch {}
      return
    }
    try {
      await navigator.clipboard.writeText(connectUrl)
      toast('Link copied')
    } catch {
      toast('Could not copy the link')
    }
  }

  const download = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      await document.fonts.ready
      const canvas = document.createElement('canvas')
      const ok = await renderCard(canvas, {
        qrDataUrl,
        name,
        username,
        avatarUrl,
        coverUrl,
        appName,
        logoUrl,
      })
      if (!ok) return
      canvas.toBlob((blob) => {
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${username}-qr.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
        toast('QR card saved')
      }, 'image/png')
    } catch {
      toast('Could not create the image')
    } finally {
      setDownloading(false)
    }
  }

  return (
    // Ticket-style invite card — dark charcoal panel with the avatar
    // straddling the top edge; the QR sits on a white tile so it scans in
    // any lighting.
    <div className="relative pt-8">
      <div
        aria-hidden
        className="absolute inset-x-6 bottom-0 top-12 rounded-[2.5rem] bg-accent-900/20 blur-2xl"
      />
      <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-accent-700 via-accent-800 to-accent-950 px-5 pb-5 pt-11 text-center text-white shadow-2xl shadow-accent-950/40 ring-1 ring-white/10">
        {/* Cover photo backdrop — dimmed so the panel stays readable; the
            gradient underneath covers users with no cover set. */}
        {coverUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative cover backdrop */}
            <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div aria-hidden className="absolute inset-0 bg-accent-950/65" />
          </>
        )}
        {/* Ambient highlights */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/15 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-14 h-40 w-40 rounded-full bg-white/5 blur-3xl"
        />

        <div className="relative">
          <p className="mt-6 text-lg font-bold leading-tight">{name}</p>
          <p className="text-sm text-white/60">@{username}</p>

          <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3 shadow-lg shadow-black/25 ring-1 ring-black/5">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR, not remote */}
              <img
                src={qrDataUrl}
                alt={`QR code — scan to connect with ${name}`}
                className="h-44 w-44"
              />
              {/* App mark centered on the code — 'H' error correction keeps it
                  scannable under the overlay. */}
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CDN logo inside a QR overlay
                  <img src={logoUrl} alt="" className="h-8 w-8 rounded-md object-contain" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-accent-500 via-accent-600 to-accent-800 text-sm font-bold text-white">
                    {appName.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
            </div>
          </div>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/55">
            <ScanIcon className="h-3.5 w-3.5" />
            Scan to connect — no login needed
          </p>

          {/* Ticket perforation */}
          <div aria-hidden className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 border-t border-dashed border-white/20" />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
              scan · follow · connect
            </span>
            <span className="h-px flex-1 border-t border-dashed border-white/20" />
          </div>
        </div>

        {/* Icon-only actions pinned to the card's top-right corner. */}
        <div className="absolute right-3.5 top-3.5 z-10 flex gap-2">
          <button
            type="button"
            onClick={share}
            aria-label="Share invite link"
            title="Share invite link"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/25 backdrop-blur transition-colors hover:bg-white/20"
          >
            <ShareIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            aria-label="Download QR card"
            title="Download QR card"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/25 backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {downloading ? <Spinner className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Avatar overlapping the card's top edge */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2">
        <div className="rounded-full bg-white p-1 shadow-xl shadow-accent-950/25 ring-1 ring-black/5">
          <Avatar src={avatarUrl} name={name} size="lg" />
        </div>
      </div>
    </div>
  )
}

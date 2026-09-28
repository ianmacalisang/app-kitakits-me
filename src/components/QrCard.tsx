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

// Composes the downloadable card on canvas — a clean centered layout: avatar
// (or initials disc), name, handle, QR with the app mark at its center, and a
// brand footer. CDN images fall back gracefully if they can't be read
// cross-origin.
const renderCard = async (
  canvas: HTMLCanvasElement,
  {
    qrDataUrl,
    name,
    username,
    avatarUrl,
    appName,
    logoUrl,
  }: {
    qrDataUrl: string
    name: string
    username: string
    avatarUrl?: string
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

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#fafafa')
  bg.addColorStop(1, '#e9e9e9')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  traceRoundRect(ctx, 90, 90, 900, 1170, 48)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'
  ctx.lineWidth = 2
  ctx.stroke()

  const cx = W / 2
  try {
    if (!avatarUrl) throw new Error('no avatar')
    const img = await loadImage(avatarUrl, 'anonymous')
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, 300, 84, 0, Math.PI * 2)
    ctx.clip()
    const s = Math.max(168 / img.width, 168 / img.height)
    ctx.drawImage(
      img,
      cx - (img.width * s) / 2,
      300 - (img.height * s) / 2,
      img.width * s,
      img.height * s,
    )
    ctx.restore()
    ctx.beginPath()
    ctx.arc(cx, 300, 84, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 3
    ctx.stroke()
  } catch {
    const g = ctx.createLinearGradient(cx - 84, 216, cx + 84, 384)
    g.addColorStop(0, '#404040')
    g.addColorStop(1, '#141414')
    ctx.beginPath()
    ctx.arc(cx, 300, 84, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 64px Poppins, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name.charAt(0).toUpperCase(), cx, 306)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#212121'
  ctx.font = '600 50px Poppins, Arial, sans-serif'
  ctx.fillText(name.length > 22 ? `${name.slice(0, 21)}…` : name, cx, 478)
  ctx.fillStyle = '#737373'
  ctx.font = '400 30px Poppins, Arial, sans-serif'
  ctx.fillText(`@${username}`, cx, 528)

  // QR tile.
  traceRoundRect(ctx, 250, 590, 580, 580, 36)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = 2
  ctx.stroke()
  const qr = await loadImage(qrDataUrl)
  ctx.drawImage(qr, 280, 620, 520, 520)

  // App mark centered on the QR — white pad + logo (or the gradient letter
  // tile). 'H' error correction keeps the code readable under the overlay.
  traceRoundRect(ctx, 474, 814, 132, 132, 30)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 2
  ctx.stroke()
  try {
    if (!logoUrl) throw new Error('no logo')
    const logo = await loadImage(logoUrl, 'anonymous')
    const s = Math.min(92 / logo.width, 92 / logo.height)
    ctx.drawImage(
      logo,
      540 - (logo.width * s) / 2,
      880 - (logo.height * s) / 2,
      logo.width * s,
      logo.height * s,
    )
  } catch {
    traceRoundRect(ctx, 494, 834, 92, 92, 24)
    const lg = ctx.createLinearGradient(494, 834, 586, 926)
    lg.addColorStop(0, '#404040')
    lg.addColorStop(1, '#1a1a1a')
    ctx.fillStyle = lg
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 52px Poppins, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(appName.charAt(0).toUpperCase(), 540, 884)
  }

  ctx.fillStyle = '#a3a3a3'
  ctx.font = '500 28px Poppins, Arial, sans-serif'
  ctx.fillText(`Scan to connect on ${appName}`, 540, 1230)

  return true
}

// The /invite page card — QR, owner identity, download + share actions.
export function QrCard({
  qrDataUrl,
  connectUrl,
  name,
  username,
  avatarUrl,
  appName,
  logoUrl,
}: {
  qrDataUrl: string
  connectUrl: string
  name: string
  username: string
  avatarUrl?: string
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

          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-accent-900 shadow-md shadow-black/20 transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
            >
              {downloading ? (
                <Spinner className="h-4 w-4 text-accent-900" />
              ) : (
                <DownloadIcon className="h-4 w-4" />
              )}
              {downloading ? 'Saving…' : 'Download'}
            </button>
            <button
              type="button"
              onClick={share}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-white/15"
            >
              <ShareIcon className="h-4 w-4" />
              Share
            </button>
          </div>
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

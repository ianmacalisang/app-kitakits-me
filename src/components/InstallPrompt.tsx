'use client'

import { useEffect, useState } from 'react'

import { BrandMark, useBranding } from './Branding'
import { DownloadIcon, PlusIcon, XIcon } from './icons'

const DISMISS_KEY = 'pwa-install-dismissed'
const INSTALLED_KEY = 'pwa-installed'
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000

// Not in the DOM lib yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isDismissed = () => {
  const at = Number(localStorage.getItem(DISMISS_KEY))
  return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS
}

// Registers the service worker and shows the install prompt. Chrome/Android
// get the native dialog via beforeinstallprompt; iOS has no programmatic
// prompt, so it gets instructions instead. Mounted once in the app layout.
export function InstallPrompt() {
  const { appName } = useBranding()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOS, setShowIOS] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    if (isStandalone() || isDismissed() || localStorage.getItem(INSTALLED_KEY)) return

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, '1')
      setDeferred(null)
      setShowIOS(false)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // iOS Safari never fires beforeinstallprompt — show instructions instead.
    let iosTimer: ReturnType<typeof setTimeout> | undefined
    if (isIOS()) iosTimer = setTimeout(() => setShowIOS(true), 1500)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      if (iosTimer) clearTimeout(iosTimer)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDeferred(null)
    setShowIOS(false)
  }

  const install = async () => {
    if (deferred) {
      await deferred.prompt()
      await deferred.userChoice.catch(() => null)
      setDeferred(null)
      return
    }
    // iOS has no programmatic install — the native share sheet is the closest
    // we can get: "Add to Home Screen" lives one tap inside it.
    if (navigator.share) {
      await navigator
        .share({ title: appName, url: `${window.location.origin}/home` })
        .catch(() => {})
    }
  }

  const canInstall = !!deferred || (showIOS && typeof navigator.share === 'function')

  if (!deferred && !showIOS) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="glass motion-safe:animate-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl p-3 shadow-lg">
        <BrandMark size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install {appName}</p>
          {showIOS && !deferred ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-neutral-500 dark:text-neutral-400">
              Tap Install, then choose
              <PlusIcon className="inline h-3.5 w-3.5" />
              Add to Home Screen
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Add it to your home screen
            </p>
          )}
        </div>
        {canInstall && (
          <button
            type="button"
            onClick={install}
            className="flex items-center gap-1.5 rounded-full bg-accent-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-500"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/10 dark:hover:text-neutral-300"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { toDataURL } from 'qrcode'

import { QrCodeIcon, ScanIcon, UsersIcon } from '@/components/icons'
import { QrCard } from '@/components/QrCard'
import { QrScanButton } from '@/components/QrScannerSheet'
import { getCurrentUser, getRequestOrigin } from '@/lib/auth'
import { connectPath } from '@/lib/connect-path'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl, coverUrl } from '@/lib/serialize'
import { getSiteSettings } from '@/lib/settings'

export const metadata = { title: 'Invite' }

const STEPS = [
  { icon: QrCodeIcon, label: 'Show your code' },
  { icon: ScanIcon, label: 'They scan it' },
  { icon: UsersIcon, label: 'You both follow' },
]

export default async function InvitePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const [fullUser, origin, settings] = await Promise.all([
    payload.findByID({ collection: 'users', id: user.id, depth: 1 }),
    getRequestOrigin(),
    getSiteSettings(),
  ])

  const connectUrl = `${origin}${connectPath(user.username)}`
  const qrDataUrl = await toDataURL(connectUrl, {
    // 'H' (30% recovery) so the centered logo overlay can't break the code.
    errorCorrectionLevel: 'H',
    margin: 0,
    width: 800,
    color: { dark: '#212121', light: '#ffffff' },
  })

  return (
    <div className="flex flex-col gap-4">
      <header className="text-center">
        <h1 className="text-lg font-bold">Your invite code</h1>
        <p className="mx-auto mt-0.5 max-w-xs text-xs text-neutral-500">
          Anyone who scans it follows you — and you follow them back.
        </p>
      </header>

      {/* How it works + scanner — steps hidden on small screens, where the
          Open Scanner button takes the full row. */}
      <div className="flex items-stretch gap-3">
        <ol className="glass relative hidden flex-1 grid-cols-3 rounded-2xl px-3 pb-4 pt-3.5 sm:grid">
          <span
            aria-hidden
            className="motion-safe:animate-dash-flow absolute left-[16.67%] right-[16.67%] top-8 h-px"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to right, var(--color-accent-400) 0 6px, transparent 6px 12px)',
            }}
          />
          {STEPS.map(({ icon: Icon, label }) => (
            <li key={label} className="relative flex flex-col items-center gap-1.5 text-center">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-600 to-accent-900 text-white shadow-md shadow-accent-900/25 ring-4 ring-white/80 dark:ring-neutral-900">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold leading-tight text-neutral-700">
                {label}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex w-full sm:w-28 sm:shrink-0">
          <QrScanButton appName={settings.appName} />
        </div>
      </div>

      <QrCard
        qrDataUrl={qrDataUrl}
        connectUrl={connectUrl}
        name={fullUser.name}
        username={fullUser.username}
        avatarUrl={avatarUrl(fullUser)}
        coverUrl={coverUrl(fullUser)}
        appName={settings.appName}
        logoUrl={settings.logoUrl}
      />
    </div>
  )
}

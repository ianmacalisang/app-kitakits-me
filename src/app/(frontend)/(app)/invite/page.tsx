import { redirect } from 'next/navigation'
import { toDataURL } from 'qrcode'

import { QrCodeIcon, ScanIcon, UsersIcon } from '@/components/icons'
import { QrCard } from '@/components/QrCard'
import { QrScanButton } from '@/components/QrScannerSheet'
import { getCurrentUser, getRequestOrigin } from '@/lib/auth'
import { connectPath } from '@/lib/connect-path'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl } from '@/lib/serialize'
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

      <QrScanButton appName={settings.appName} />

      <QrCard
        qrDataUrl={qrDataUrl}
        connectUrl={connectUrl}
        name={fullUser.name}
        username={fullUser.username}
        avatarUrl={avatarUrl(fullUser)}
        appName={settings.appName}
        logoUrl={settings.logoUrl}
      />

      {/* How it works — three steps on a dashed timeline; the white ring on
          each disc keeps the connector hidden behind it. */}
      <ol className="glass relative grid grid-cols-3 rounded-2xl px-3 pb-4 pt-3.5">
        <span
          aria-hidden
          className="absolute left-[16.67%] right-[16.67%] top-8 border-t border-dashed border-accent-300/70"
        />
        {STEPS.map(({ icon: Icon, label }) => (
          <li key={label} className="relative flex flex-col items-center gap-1.5 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-600 to-accent-900 text-white shadow-md shadow-accent-900/25 ring-4 ring-white/80">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-semibold leading-tight text-neutral-700">
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

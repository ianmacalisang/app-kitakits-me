import Link from 'next/link'

import { BrandMark } from '@/components/Branding'
import { ConnectConfirm } from '@/components/ConnectConfirm'
import { XIcon } from '@/components/icons'
import { getCurrentUser } from '@/lib/auth'
import { readConnectToken, verifyConnectToken } from '@/lib/connect'
import { connectPath } from '@/lib/connect-path'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl } from '@/lib/serialize'

export const metadata = { title: 'Connect', robots: { index: false } }

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex min-h-screen items-center justify-center px-4 py-8">
    <div className="animate-page-in w-full max-w-sm">
      <div className="mx-auto mb-4 w-fit">
        <BrandMark size="md" />
      </div>
      <div className="glass rounded-3xl p-6 text-center">{children}</div>
    </div>
  </main>
)

const ErrorCard = ({
  title,
  message,
  ownerUsername,
}: {
  title: string
  message: string
  ownerUsername?: string
}) => (
  <div className="flex flex-col items-center gap-3">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
      <XIcon className="h-5 w-5" />
    </span>
    <div>
      <p className="text-sm font-semibold text-neutral-800">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">{message}</p>
    </div>
    {ownerUsername ? (
      <Link
        href={connectPath(ownerUsername)}
        className="btn-primary mt-1 rounded-xl px-5 py-2.5 text-sm"
      >
        Request a new link
      </Link>
    ) : (
      <p className="text-xs text-neutral-400">Ask your friend to show their QR code again.</p>
    )}
  </div>
)

export default async function ConnectConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const ids = typeof token === 'string' ? readConnectToken(token) : null

  if (!ids) {
    return (
      <Shell>
        <ErrorCard title="That link isn't valid" message="It may have been copied incorrectly." />
      </Shell>
    )
  }

  const payload = await getPayloadClient()
  const [scanner, owner] = await Promise.all([
    payload.findByID({ collection: 'users', id: ids.scannerId, depth: 1 }),
    payload.findByID({ collection: 'users', id: ids.ownerId, depth: 1 }),
  ])

  if (!scanner || !owner) {
    return (
      <Shell>
        <ErrorCard
          title="This connection can't be completed"
          message="One of these accounts no longer exists."
        />
      </Shell>
    )
  }

  // Signature verified above; verifyConnectToken returning null here means
  // the link expired — offer a path back to request a fresh one.
  if (!verifyConnectToken(token ?? '')) {
    return (
      <Shell>
        <ErrorCard
          title="That link expired"
          message="Connect links are only good for 30 minutes — grab a fresh one."
          ownerUsername={owner.username}
        />
      </Shell>
    )
  }

  const viewer = await getCurrentUser()

  return (
    <Shell>
      <ConnectConfirm
        token={token ?? ''}
        scannerName={scanner.name}
        scannerUsername={scanner.username}
        scannerAvatarUrl={avatarUrl(scanner)}
        ownerName={owner.name}
        ownerUsername={owner.username}
        ownerAvatarUrl={avatarUrl(owner)}
        loggedIn={Boolean(viewer)}
        loggedInAs={viewer?.username}
      />
    </Shell>
  )
}

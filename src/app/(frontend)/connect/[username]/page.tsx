import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Avatar } from '@/components/Avatar'
import { BrandMark } from '@/components/Branding'
import { ConnectInvite } from '@/components/ConnectInvite'
import { getCurrentUser } from '@/lib/auth'
import { findUserByUsername, mutualConnect } from '@/lib/connect'
import { connectPath, USERNAME_PATTERN } from '@/lib/connect-path'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl } from '@/lib/serialize'
import { getSiteSettings } from '@/lib/settings'

const findOwner = async (username: string) => {
  const payload = await getPayloadClient()
  return findUserByUsername(payload, username)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  const owner = USERNAME_PATTERN.test(username) ? await findOwner(username) : null
  return {
    title: owner ? `Connect with ${owner.name}` : 'Connect',
    robots: { index: false },
  }
}

export default async function ConnectPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const owner = USERNAME_PATTERN.test(username) ? await findOwner(username) : null
  if (!owner) notFound()

  const [viewer, settings] = await Promise.all([getCurrentUser(), getSiteSettings()])

  // Your own code → your QR page.
  if (viewer?.id === owner.id) redirect('/invite')

  const ownerAvatar = avatarUrl(owner)

  if (viewer) {
    const payload = await getPayloadClient()
    await mutualConnect(payload, viewer, owner)
    const fullViewer = await payload.findByID({ collection: 'users', id: viewer.id, depth: 1 })
    const firstName = owner.name.split(' ')[0] || owner.name

    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="animate-page-in w-full max-w-sm">
          <div className="mx-auto mb-4 w-fit">
            <BrandMark size="md" />
          </div>
          <div className="glass flex flex-col items-center gap-4 rounded-3xl p-6 text-center">
            <div className="flex items-center justify-center -space-x-4">
              <Avatar src={avatarUrl(fullViewer)} name={viewer.name} size="lg" />
              <Avatar src={ownerAvatar} name={owner.name} size="lg" />
            </div>
            <div>
              <h1 className="text-base font-bold text-neutral-800">
                You and {owner.name} are now connected
              </h1>
              <p className="mt-1 text-xs text-neutral-500">
                You&apos;ll see each other&apos;s posts in your feeds.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <Link
                href={`/mailbox?to=${owner.username}`}
                className="btn-primary rounded-xl py-2.5 text-sm"
              >
                Send {firstName} a mail
              </Link>
              <Link
                href={`/profile/${owner.username}`}
                className="rounded-xl bg-black/5 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-black/10"
              >
                View @{owner.username}&apos;s profile
              </Link>
              <Link href="/home" className="py-1.5 text-sm text-neutral-500 hover:text-neutral-800">
                Go home
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const next = connectPath(owner.username)

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="animate-page-in w-full max-w-sm">
        <div className="mx-auto mb-4 w-fit">
          <BrandMark size="md" />
        </div>
        <div className="glass rounded-3xl p-6 text-center">
          <div className="mx-auto w-fit">
            <Avatar src={ownerAvatar} name={owner.name} size="lg" />
          </div>
          <h1 className="mt-3 text-base font-bold text-neutral-800">
            {owner.name} wants to connect
          </h1>
          <p className="text-sm text-neutral-500">
            @{owner.username} · {settings.appName}
          </p>

          <ConnectInvite
            ownerUsername={owner.username}
            appName={settings.appName}
            registerHref={`/register?next=${encodeURIComponent(next)}`}
            loginHref={`/login?next=${encodeURIComponent(next)}`}
          />
        </div>
      </div>
    </main>
  )
}

import { redirect } from 'next/navigation'

import { MailboxView } from '@/components/MailboxView'
import { getCurrentUser } from '@/lib/auth'
import { getTopBadgesForUsers } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import { toDraftData, toThreadData, type ThreadData } from '@/lib/serialize'
import type { User } from '@/payload-types'

export const metadata = { title: 'Mailbox' }

export default async function MailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { to } = await searchParams

  const payload = await getPayloadClient()
  const [result, draftResult] = await Promise.all([
    payload.find({
      collection: 'threads',
      where: { visibleTo: { contains: user.id } },
      sort: '-lastMessageAt',
      limit: 20,
      depth: 2,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: 'mail-drafts',
      where: { author: { equals: user.id } },
      sort: '-updatedAt',
      limit: 50,
      depth: 2,
      user,
      overrideAccess: false,
    }),
  ])

  const otherIds = [
    ...result.docs.flatMap((doc) =>
      (Array.isArray(doc.participants) ? doc.participants : [])
        .filter((p): p is User => typeof p === 'object' && p !== null)
        .map((p) => p.id),
    ),
    ...draftResult.docs
      .map((doc) => doc.recipient)
      .filter((p): p is User => typeof p === 'object' && p !== null)
      .map((p) => p.id),
  ].filter((id) => id !== user.id)
  const topBadges = await getTopBadgesForUsers(payload, otherIds)

  const threads = result.docs
    .map((doc) => toThreadData(doc, user, topBadges))
    .filter((t): t is ThreadData => t !== null)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Mailbox</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Private messages between you and other members.
        </p>
      </div>
      <MailboxView
        threads={threads}
        initialHasMore={result.hasNextPage}
        drafts={draftResult.docs.map((doc) => toDraftData(doc, topBadges))}
        composeTo={to?.trim() || null}
      />
    </div>
  )
}

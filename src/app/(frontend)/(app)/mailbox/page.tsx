import { redirect } from 'next/navigation'

import { MailboxView } from '@/components/MailboxView'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { toDraftData, toThreadData, type ThreadData } from '@/lib/serialize'

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

  const threads = result.docs
    .map((doc) => toThreadData(doc, user))
    .filter((t): t is ThreadData => t !== null)

  return (
    <MailboxView
      threads={threads}
      initialHasMore={result.hasNextPage}
      drafts={draftResult.docs.map(toDraftData)}
      composeTo={to?.trim() || null}
    />
  )
}

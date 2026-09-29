import { notFound, redirect } from 'next/navigation'

import { MailThreadView } from '@/components/MailThreadView'
import { getCurrentUser } from '@/lib/auth'
import { getTopBadgesForUsers } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import {
  avatarUrl,
  type MailMessageData,
  relId,
  toMailMessageData,
  toThreadData,
} from '@/lib/serialize'
import type { User } from '@/payload-types'

export const metadata = { title: 'Mail' }

export default async function MailThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const threadId = Number(id)
  if (!Number.isInteger(threadId)) notFound()

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  let thread
  try {
    thread = await payload.findByID({
      collection: 'threads',
      id: threadId,
      depth: 2,
      user,
      overrideAccess: false,
    })
  } catch {
    notFound()
  }

  // A thread deleted from this user's mailbox stays gone until a reply lands.
  const visibleTo = (Array.isArray(thread.visibleTo) ? thread.visibleTo : [])
    .map(relId)
    .filter((v): v is number => v !== null)
  if (!visibleTo.includes(user.id)) notFound()

  const otherId = (Array.isArray(thread.participants) ? thread.participants : [])
    .filter((p): p is User => typeof p === 'object' && p !== null)
    .map((p) => p.id)
    .find((pid) => pid !== user.id)
  const topBadges = await getTopBadgesForUsers(payload, otherId ? [otherId] : [])

  const threadData = toThreadData(thread, user, topBadges)
  if (!threadData) notFound()

  const [messages, fullUser] = await Promise.all([
    payload.find({
      collection: 'messages',
      where: { thread: { equals: threadId } },
      sort: 'createdAt',
      limit: 200,
      depth: 2,
      user,
      overrideAccess: false,
    }),
    payload.findByID({ collection: 'users', id: user.id, depth: 1 }),
  ])

  return (
    <MailThreadView
      thread={threadData}
      messages={messages.docs
        .map((doc) => toMailMessageData(doc, user))
        .filter((m): m is MailMessageData => m !== null)}
      viewerName={fullUser.name}
      viewerAvatarUrl={avatarUrl(fullUser)}
    />
  )
}

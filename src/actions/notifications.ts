'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { revalidateNavCounts } from '@/lib/nav-cache'
import { getPayloadClient } from '@/lib/payload'
import { type NotificationData, type Paged, toNotificationData } from '@/lib/serialize'

export async function getNotifications(page = 1): Promise<Paged<NotificationData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'notifications',
    where: { recipient: { equals: user.id } },
    sort: '-createdAt',
    page,
    limit: 20,
    depth: 2,
    user,
    overrideAccess: false,
  })

  return {
    items: result.docs.map(toNotificationData).filter((n): n is NotificationData => n !== null),
    hasMore: result.hasNextPage,
  }
}

export async function markNotificationRead(notificationId: number) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  await payload.update({
    collection: 'notifications',
    id: notificationId,
    data: { read: true },
    user,
    overrideAccess: false,
  })

  revalidateNavCounts(user.id)
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  await payload.update({
    collection: 'notifications',
    where: {
      and: [{ recipient: { equals: user.id } }, { read: { equals: false } }],
    },
    data: { read: true },
    user,
    overrideAccess: false,
  })

  revalidateNavCounts(user.id)
}

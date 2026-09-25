'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'

export async function toggleSave(postId: number): Promise<{ saved: boolean; count: number }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  const existing = await payload.find({
    collection: 'saves',
    where: {
      and: [{ user: { equals: user.id } }, { post: { equals: postId } }],
    },
    limit: 1,
    depth: 0,
    user,
    overrideAccess: false,
  })

  if (existing.docs[0]) {
    await payload.delete({
      collection: 'saves',
      id: existing.docs[0].id,
      user,
      overrideAccess: false,
    })

    const count = await payload.count({
      collection: 'saves',
      where: { post: { equals: postId } },
      user,
      overrideAccess: false,
    })
    return { saved: false, count: count.totalDocs }
  }

  await payload.create({
    collection: 'saves',
    data: { user: user.id, post: postId },
    user,
    overrideAccess: false,
  })

  const count = await payload.count({
    collection: 'saves',
    where: { post: { equals: postId } },
    user,
    overrideAccess: false,
  })
  return { saved: true, count: count.totalDocs }
}

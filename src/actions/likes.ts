'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'

export async function toggleLike(postId: number): Promise<{ liked: boolean; count: number }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  const existing = await payload.find({
    collection: 'likes',
    where: {
      and: [{ user: { equals: user.id } }, { post: { equals: postId } }],
    },
    limit: 1,
    depth: 0,
    user,
    overrideAccess: false,
  })

  let liked: boolean
  if (existing.docs[0]) {
    await payload.delete({
      collection: 'likes',
      id: existing.docs[0].id,
      user,
      overrideAccess: false,
    })
    liked = false
  } else {
    await payload.create({
      collection: 'likes',
      data: { user: user.id, post: postId },
      user,
      overrideAccess: false,
    })
    liked = true
  }

  const count = await payload.count({
    collection: 'likes',
    where: { post: { equals: postId } },
    user,
    overrideAccess: false,
  })

  return { liked, count: count.totalDocs }
}

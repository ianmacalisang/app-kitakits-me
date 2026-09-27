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

  let saved: boolean
  if (existing.docs[0]) {
    await payload.delete({
      collection: 'saves',
      id: existing.docs[0].id,
      user,
      overrideAccess: false,
    })
    saved = false
  } else {
    await payload.create({
      collection: 'saves',
      data: { user: user.id, post: postId },
      user,
      overrideAccess: false,
    })
    saved = true
  }

  // The counter hooks already bumped the denormalized column — read it off
  // the post row instead of recounting the saves table.
  const post = await payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 0,
    overrideAccess: true,
  })
  return { saved, count: post.saveCount ?? 0 }
}

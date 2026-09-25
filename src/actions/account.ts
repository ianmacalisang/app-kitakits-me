'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { deleteUserData } from '@/lib/account'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl, coverUrl, mediaUrl, relId, toAboutBlocks } from '@/lib/serialize'

import type { FormState } from './auth'

// JSON export of everything the user owns: profile fields, the about-page
// blocks, and every post. Media is exported as URLs, not binary.
export async function exportUserData(): Promise<{ data?: string; error?: string }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const [fullUser, posts] = await Promise.all([
    payload.findByID({ collection: 'users', id: user.id, depth: 1 }),
    payload.find({
      collection: 'posts',
      where: { author: { equals: user.id } },
      sort: '-createdAt',
      limit: 0,
      depth: 1,
    }),
  ])

  const data = {
    exportedAt: new Date().toISOString(),
    profile: {
      name: fullUser.name,
      username: fullUser.username,
      email: fullUser.email,
      bio: fullUser.bio ?? null,
      website: fullUser.website ?? null,
      avatarUrl: avatarUrl(fullUser) ?? null,
      coverUrl: coverUrl(fullUser) ?? null,
      memberSince: fullUser.createdAt,
    },
    about: toAboutBlocks(fullUser),
    posts: posts.docs.map((post) => ({
      id: post.id,
      content: post.content ?? null,
      visibility: post.visibility ?? 'public',
      pinned: Boolean(post.pinned),
      createdAt: post.createdAt,
      images: (Array.isArray(post.image) ? post.image : [])
        .map((media) => mediaUrl(media))
        .filter((url): url is string => Boolean(url)),
      sharedPostId: relId(post.sharedPost),
    })),
  }

  return { data: JSON.stringify(data, null, 2) }
}

// Permanently deletes the account and every document connected to it. Runs
// with access control overridden — users can't delete their own doc (and
// most connected collections restrict delete to admins), but the acting
// identity is still verified via getCurrentUser + the typed username.
export async function deleteAccount(confirmation: string): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (confirmation.trim() !== user.username) {
    return { error: 'The username you entered does not match.' }
  }

  const payload = await getPayloadClient()
  const userId = user.id

  try {
    await deleteUserData(payload, userId)
  } catch (err) {
    payload.logger.error({ err, msg: 'Account deletion failed', userId })
    return { error: 'Could not delete your account. Please try again.' }
  }

  const store = await cookies()
  store.delete('payload-token')
  redirect('/')
}

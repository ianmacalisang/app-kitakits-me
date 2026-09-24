'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Where } from 'payload'

import { deleteUnreferencedMedia } from '@/hooks/deletePostMedia'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl, coverUrl, mediaUrl, relId, toAboutBlocks } from '@/lib/serialize'

import type { FormState } from './auth'

const addMediaIds = (into: Set<number>, value: unknown) => {
  for (const entry of Array.isArray(value) ? value : [value]) {
    const id = relId(entry)
    if (id !== null) into.add(id)
  }
}

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
  const mediaIds = new Set<number>()

  try {
    // Gather the media the user references before their docs disappear —
    // post images join this set inside the post loop below.
    const fullUser = await payload.findByID({ collection: 'users', id: userId, depth: 0 })
    addMediaIds(mediaIds, fullUser.avatar)
    addMediaIds(mediaIds, fullUser.cover)
    for (const block of fullUser.about ?? []) {
      if (block.blockType === 'image') addMediaIds(mediaIds, block.image)
    }

    // Notifications first — they hold foreign keys to the user's posts,
    // comments, and the user row itself, so they must go before anything
    // they point at.
    await payload.delete({
      collection: 'notifications',
      where: { or: [{ recipient: { equals: userId } }, { actor: { equals: userId } }] },
    })

    // Mailbox: drop every thread the user touches, plus its messages and
    // attachment uploads (messages/attachments FK to threads, so threads
    // go last).
    const threads = await payload.find({
      collection: 'threads',
      where: {
        or: [
          { participants: { contains: userId } },
          { visibleTo: { contains: userId } },
          { unreadFor: { contains: userId } },
          { lastSender: { equals: userId } },
        ],
      },
      limit: 0,
      depth: 0,
    })
    const threadIds = threads.docs.map((thread) => thread.id)

    const messageWhere: Where = {
      or: [
        ...(threadIds.length > 0 ? [{ thread: { in: threadIds } }] : []),
        { sender: { equals: userId } },
        { participants: { contains: userId } },
      ],
    }
    await payload.delete({ collection: 'messages', where: messageWhere })

    const attachmentWhere: Where = {
      or: [
        ...(threadIds.length > 0 ? [{ thread: { in: threadIds } }] : []),
        { uploader: { equals: userId } },
        { participants: { contains: userId } },
      ],
    }
    await payload.delete({ collection: 'mail-attachments', where: attachmentWhere })

    if (threadIds.length > 0) {
      await payload.delete({ collection: 'threads', where: { id: { in: threadIds } } })
    }

    // Drafts authored by the user are deleted; drafts other people
    // addressed to the account lose their recipient instead.
    await payload.delete({ collection: 'mail-drafts', where: { author: { equals: userId } } })
    await payload.update({
      collection: 'mail-drafts',
      where: { recipient: { equals: userId } },
      data: { recipient: null },
    })

    // Posts one by one so each runs its hooks: share posts, comments,
    // likes, saves, and notifications cascade in beforeDelete, and
    // orphaned post media is removed in afterDelete.
    const posts = await payload.find({
      collection: 'posts',
      where: { author: { equals: userId } },
      limit: 0,
      depth: 0,
      select: { image: true },
    })
    for (const post of posts.docs) {
      addMediaIds(mediaIds, post.image)
      await payload.delete({ collection: 'posts', id: post.id })
    }

    // Comments the user left on other people's posts (their notifications
    // were already swept above).
    await payload.delete({ collection: 'comments', where: { author: { equals: userId } } })

    // The rest of the user's connections.
    await payload.delete({ collection: 'likes', where: { user: { equals: userId } } })
    await payload.delete({ collection: 'saves', where: { user: { equals: userId } } })
    await payload.delete({
      collection: 'follows',
      where: { or: [{ follower: { equals: userId } }, { following: { equals: userId } }] },
    })

    await payload.delete({ collection: 'users', id: userId })

    // Now that the user row (and its avatar/cover/about references) is
    // gone, drop every media doc nothing else uses.
    await deleteUnreferencedMedia(payload, [...mediaIds])
  } catch (err) {
    payload.logger.error({ err, msg: 'Account deletion failed', userId })
    return { error: 'Could not delete your account. Please try again.' }
  }

  const store = await cookies()
  store.delete('payload-token')
  redirect('/')
}

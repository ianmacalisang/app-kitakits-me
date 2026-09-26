import type { Payload, Where } from 'payload'

import { deleteUnreferencedMedia } from '../hooks/deletePostMedia'
import { relId } from './serialize'

const addMediaIds = (into: Set<number>, value: unknown) => {
  for (const entry of Array.isArray(value) ? value : [value]) {
    const id = relId(entry)
    if (id !== null) into.add(id)
  }
}

// Permanently deletes a user's account and every document connected to it.
// Shared by the deleteAccount server action and the REST
// /api/users/delete-account endpoint used by the iOS app. Callers are
// responsible for verifying the caller's identity first.
export async function deleteUserData(payload: Payload, userId: number): Promise<void> {
  const mediaIds = new Set<number>()

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

  // Testimonials the user wrote or received — their notifications were
  // swept above since the user is always the actor or recipient.
  await payload.delete({
    collection: 'testimonials',
    where: { or: [{ author: { equals: userId } }, { recipient: { equals: userId } }] },
  })

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
}

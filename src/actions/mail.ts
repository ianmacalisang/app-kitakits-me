'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getTopBadgesForUsers } from '@/lib/gamification'
import {
  MAIL_ATTACHMENT_MAX_BYTES,
  MAIL_ATTACHMENT_MAX_FILES,
  MAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  isMailAttachmentType,
} from '@/lib/mail-attachments'
import { revalidateNavCounts } from '@/lib/nav-cache'
import { getPayloadClient } from '@/lib/payload'
import { mailHtmlToText } from '@/lib/sanitize'
import {
  avatarUrl,
  type BadgeData,
  type DraftData,
  type Paged,
  type ThreadData,
  toDraftData,
  toThreadData,
} from '@/lib/serialize'
import type { Thread, User } from '@/payload-types'

// Non-viewer participant ids across a page of threads — one batch badge
// lookup covers every otherName the list renders.
const otherParticipantIds = (docs: Thread[], viewerId: number): number[] =>
  docs.flatMap((doc) =>
    (Array.isArray(doc.participants) ? doc.participants : [])
      .filter((p): p is User => typeof p === 'object' && p !== null)
      .map((p) => p.id)
      .filter((id) => id !== viewerId),
  )

export interface MailRecipient {
  id: number
  name: string
  username: string
  avatarUrl?: string
  badge?: BadgeData
}

export interface SendMailState {
  error?: string
  threadId?: number
  sent?: boolean
}

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>

const attachmentFiles = (formData: FormData | undefined | null): File[] =>
  (formData?.getAll('attachment') ?? []).filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  )

const attachmentError = (files: File[]): string | null => {
  if (files.length > MAIL_ATTACHMENT_MAX_FILES) {
    return `Attach at most ${MAIL_ATTACHMENT_MAX_FILES} files.`
  }
  if (files.some((file) => !isMailAttachmentType(file.type))) {
    return 'Attachments can be images, PDFs, or plain text files.'
  }
  if (files.some((file) => file.size > MAIL_ATTACHMENT_MAX_BYTES)) {
    return 'Each attachment must be 5 MB or smaller.'
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > MAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
    return 'Attachments are too large together — keep the total under 9 MB.'
  }
  return null
}

// Uploads land in the access-controlled mail-attachments collection: the
// hook copies the thread's participants onto each doc, so files are only
// readable through /api/mail-attachments/file/... by the people in the mail.
async function uploadMailAttachments(
  payload: PayloadClient,
  user: User,
  threadId: number,
  files: File[],
): Promise<number[]> {
  const ids: number[] = []
  for (const file of files) {
    const attachment = await payload.create({
      collection: 'mail-attachments',
      data: { uploader: user.id, thread: threadId },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        name: file.name,
        size: file.size,
      },
      user,
      overrideAccess: false,
    })
    ids.push(attachment.id)
  }
  return ids
}

const deleteMailAttachments = async (payload: PayloadClient, ids: number[]) => {
  for (const id of ids) {
    await payload.delete({ collection: 'mail-attachments', id }).catch(() => {})
  }
}

export async function getThreads(box: 'inbox' | 'sent', page = 1): Promise<Paged<ThreadData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'threads',
    where: {
      and: [
        { visibleTo: { contains: user.id } },
        ...(box === 'sent' ? [{ lastSender: { equals: user.id } }] : []),
      ],
    },
    sort: '-lastMessageAt',
    page,
    limit: 20,
    depth: 2,
    user,
    overrideAccess: false,
  })

  const topBadges = await getTopBadgesForUsers(payload, otherParticipantIds(result.docs, user.id))

  return {
    items: result.docs
      .map((doc) => toThreadData(doc, user, topBadges))
      .filter((t): t is ThreadData => t !== null),
    hasMore: result.hasNextPage,
  }
}

export async function searchMailThreads(query: string): Promise<ThreadData[]> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const q = query.trim()
  if (!q) return []

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'threads',
    where: {
      and: [
        { visibleTo: { contains: user.id } },
        {
          or: [
            { subject: { contains: q } },
            { lastSnippet: { contains: q } },
            { 'participants.name': { contains: q } },
            { 'participants.username': { contains: q } },
          ],
        },
      ],
    },
    sort: '-lastMessageAt',
    limit: 30,
    depth: 2,
    user,
    overrideAccess: false,
  })

  const topBadges = await getTopBadgesForUsers(payload, otherParticipantIds(result.docs, user.id))

  const needle = q.toLowerCase()
  return (
    result.docs
      .map((doc) => toThreadData(doc, user, topBadges))
      .filter((t): t is ThreadData => t !== null)
      // The participants clause can match the searcher's own name — drop rows
      // where neither the mail fields nor the *other* person match.
      .filter(
        (t) =>
          t.subject.toLowerCase().includes(needle) ||
          (t.snippet ?? '').toLowerCase().includes(needle) ||
          t.otherName.toLowerCase().includes(needle) ||
          t.otherUsername.toLowerCase().includes(needle),
      )
  )
}

export async function sendMail(_prev: SendMailState, formData: FormData): Promise<SendMailState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const to = String(formData.get('to') ?? '')
    .trim()
    .replace(/^@/, '')
  const subject = String(formData.get('subject') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const draftId = Number(formData.get('draftId') ?? 0) || null
  const files = attachmentFiles(formData)

  if (!to) return { error: 'Add a recipient.' }
  if (!subject) return { error: 'Add a subject.' }
  if (!mailHtmlToText(body)) return { error: 'Write something first.' }
  const fileError = attachmentError(files)
  if (fileError) return { error: fileError }

  const payload = await getPayloadClient()
  const found = await payload.find({
    collection: 'users',
    where: {
      or: [{ username: { equals: to } }, { username: { equals: to.toLowerCase() } }],
    },
    limit: 1,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const recipient = found.docs[0]
  if (!recipient) return { error: `No user found with username @${to}.` }
  if (recipient.id === user.id) return { error: "You can't send mail to yourself." }

  try {
    const thread = await payload.create({
      collection: 'threads',
      data: {
        participants: [user.id, recipient.id],
        subject,
        visibleTo: [user.id, recipient.id],
      },
      user,
      overrideAccess: false,
    })

    let attachmentIds: number[] = []
    try {
      attachmentIds = await uploadMailAttachments(payload, user, thread.id, files)
      // The afterChange hook fills in lastMessage*, unreadFor, and messageCount.
      await payload.create({
        collection: 'messages',
        data: {
          thread: thread.id,
          sender: user.id,
          body,
          attachments: attachmentIds,
        },
        user,
        overrideAccess: false,
      })
    } catch (err) {
      // Don't leave an empty ghost thread (or its uploads) behind.
      await deleteMailAttachments(payload, attachmentIds)
      await payload.delete({ collection: 'threads', id: thread.id })
      throw err
    }

    // The draft was sent — drop it (access scopes the delete to the author).
    if (draftId) {
      await payload
        .delete({ collection: 'mail-drafts', id: draftId, user, overrideAccess: false })
        .catch(() => {})
    }

    return { threadId: thread.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not send your mail.' }
  }
}

// Guest mail — a signed-out visitor writing to a public profile. The sender
// supplies a name + contact instead of an account; the recipient gets a normal
// thread in their mailbox marked with the guest's details.
export async function sendGuestMail(
  _prev: SendMailState,
  formData: FormData,
): Promise<SendMailState> {
  // Signed-in senders go through the normal flow — their mail carries their
  // real account instead of a typed-in name.
  const user = await getCurrentUser()
  if (user) return sendMail(_prev, formData)

  const to = String(formData.get('to') ?? '')
    .trim()
    .replace(/^@/, '')
  const senderName = String(formData.get('senderName') ?? '')
    .trim()
    .slice(0, 120)
  const senderContact = String(formData.get('senderContact') ?? '')
    .trim()
    .slice(0, 200)
  const subject = String(formData.get('subject') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!to) return { error: 'Add a recipient.' }
  if (!senderName) return { error: 'Add your name.' }
  if (!senderContact) return { error: 'Add your contact info so they can reply.' }
  if (!subject) return { error: 'Add a subject.' }
  if (!mailHtmlToText(body)) return { error: 'Write something first.' }

  const payload = await getPayloadClient()
  const found = await payload.find({
    collection: 'users',
    where: {
      or: [{ username: { equals: to } }, { username: { equals: to.toLowerCase() } }],
    },
    limit: 1,
    depth: 0,
  })
  const recipient = found.docs[0]
  if (!recipient) return { error: `No user found with username @${to}.` }
  // Guest mail is only accepted through the public profile surface.
  if (!recipient.publicProfile || recipient.isPrivate) {
    return { error: 'This user is not accepting guest mail.' }
  }

  try {
    const thread = await payload.create({
      collection: 'threads',
      data: {
        participants: [recipient.id],
        subject,
        visibleTo: [recipient.id],
        guestName: senderName,
        guestContact: senderContact,
      },
    })

    try {
      // The afterChange hook fills in lastMessage*, unreadFor, and messageCount.
      await payload.create({
        collection: 'messages',
        data: {
          thread: thread.id,
          senderName,
          senderContact,
          body,
        },
      })
    } catch (err) {
      // Don't leave an empty ghost thread behind.
      await payload.delete({ collection: 'threads', id: thread.id })
      throw err
    }

    return { sent: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not send your mail.' }
  }
}

export async function replyToThread(
  threadId: number,
  body: string,
  formData?: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const trimmed = body.trim()
  if (!mailHtmlToText(trimmed)) return { error: 'Write something first.' }
  const files = attachmentFiles(formData)
  const fileError = attachmentError(files)
  if (fileError) return { error: fileError }

  const payload = await getPayloadClient()
  try {
    // findByID with the user enforces participant-only read access.
    await payload.findByID({
      collection: 'threads',
      id: threadId,
      depth: 0,
      user,
      overrideAccess: false,
    })
  } catch {
    return { error: 'Thread not found.' }
  }

  let attachmentIds: number[] = []
  try {
    attachmentIds = await uploadMailAttachments(payload, user, threadId, files)
    await payload.create({
      collection: 'messages',
      data: {
        thread: threadId,
        sender: user.id,
        body: trimmed,
        attachments: attachmentIds,
      },
      user,
      overrideAccess: false,
    })
    return {}
  } catch (err) {
    await deleteMailAttachments(payload, attachmentIds)
    return { error: err instanceof Error ? err.message : 'Could not send your reply.' }
  }
}

export async function markThreadRead(threadId: number) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  let thread
  try {
    thread = await payload.findByID({
      collection: 'threads',
      id: threadId,
      depth: 0,
      user,
      overrideAccess: false,
    })
  } catch {
    return
  }

  const unreadFor = (Array.isArray(thread.unreadFor) ? thread.unreadFor : [])
    .map((p: unknown) =>
      typeof p === 'object' && p !== null ? (p as { id: number }).id : (p as number),
    )
    .filter((id): id is number => typeof id === 'number' && id !== user.id)

  // System write — non-admin users can't update threads directly.
  await payload.update({
    collection: 'threads',
    id: threadId,
    data: { unreadFor },
  })

  revalidateNavCounts(user.id)
}

export async function markAllThreadsRead() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'threads',
    where: {
      and: [{ visibleTo: { contains: user.id } }, { unreadFor: { contains: user.id } }],
    },
    limit: 500,
    depth: 0,
    user,
    overrideAccess: false,
  })

  for (const doc of result.docs) {
    const unreadFor = (Array.isArray(doc.unreadFor) ? doc.unreadFor : [])
      .map((p: unknown) =>
        typeof p === 'object' && p !== null ? (p as { id: number }).id : (p as number),
      )
      .filter((id): id is number => typeof id === 'number' && id !== user.id)

    // System write — non-admin users can't update threads directly.
    await payload.update({
      collection: 'threads',
      id: doc.id,
      data: { unreadFor },
    })
  }

  revalidateNavCounts(user.id)
}

export async function deleteThread(threadId: number) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  let thread
  try {
    thread = await payload.findByID({
      collection: 'threads',
      id: threadId,
      depth: 0,
      user,
      overrideAccess: false,
    })
  } catch {
    return { error: 'Thread not found.' }
  }

  const visibleTo = (Array.isArray(thread.visibleTo) ? thread.visibleTo : [])
    .map((p: unknown) =>
      typeof p === 'object' && p !== null ? (p as { id: number }).id : (p as number),
    )
    .filter((id): id is number => typeof id === 'number' && id !== user.id)

  // Nobody can see the thread anymore — delete it outright along with its
  // messages and attachments. (visibleTo is required, so writing an empty
  // list would fail validation anyway.)
  if (visibleTo.length === 0) {
    await payload.delete({ collection: 'messages', where: { thread: { equals: threadId } } })
    await payload.delete({
      collection: 'mail-attachments',
      where: { thread: { equals: threadId } },
    })
    await payload.delete({ collection: 'threads', id: threadId })
  } else {
    await payload.update({
      collection: 'threads',
      id: threadId,
      data: { visibleTo },
    })
  }

  revalidateNavCounts(user.id)
  return {}
}

export async function getDrafts(): Promise<DraftData[]> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'mail-drafts',
    where: { author: { equals: user.id } },
    sort: '-updatedAt',
    limit: 50,
    depth: 2,
    user,
    overrideAccess: false,
  })

  const recipientIds = result.docs
    .map((doc) => doc.recipient)
    .filter((p): p is User => typeof p === 'object' && p !== null)
    .map((p) => p.id)
  const topBadges = await getTopBadgesForUsers(payload, recipientIds)

  return result.docs.map((doc) => toDraftData(doc, topBadges))
}

export async function saveDraft({
  draftId,
  to,
  recipientId,
  subject,
  body,
}: {
  draftId?: number | null
  to: string
  recipientId?: number | null
  subject: string
  body: string
}): Promise<{ draftId?: number; error?: string }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const data = {
    author: user.id,
    to: to.trim().replace(/^@/, '') || null,
    recipient: recipientId ?? null,
    subject: subject.trim(),
    body,
  }

  try {
    if (draftId) {
      const updated = await payload.update({
        collection: 'mail-drafts',
        id: draftId,
        data,
        user,
        overrideAccess: false,
      })
      return { draftId: updated.id }
    }
    const created = await payload.create({
      collection: 'mail-drafts',
      data,
      user,
      overrideAccess: false,
    })
    return { draftId: created.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the draft.' }
  }
}

export async function deleteDraft(draftId: number): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  try {
    await payload.delete({
      collection: 'mail-drafts',
      id: draftId,
      user,
      overrideAccess: false,
    })
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete the draft.' }
  }
}

export async function searchMailRecipients(query: string): Promise<MailRecipient[]> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const q = query.trim().replace(/^@/, '')
  if (!q) return []

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'users',
    where: {
      and: [
        { discoverable: { not_equals: false } },
        { id: { not_equals: user.id } },
        { or: [{ name: { contains: q } }, { username: { contains: q } }] },
      ],
    },
    sort: '-createdAt',
    limit: 6,
    depth: 1,
    user,
    overrideAccess: false,
  })

  const topBadges = await getTopBadgesForUsers(
    payload,
    result.docs.map((doc: User) => doc.id),
  )

  return result.docs.map((doc: User) => ({
    id: doc.id,
    name: doc.name,
    username: doc.username,
    avatarUrl: avatarUrl(doc),
    badge: topBadges.get(doc.id),
  }))
}

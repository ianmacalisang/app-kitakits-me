import type { CollectionAfterChangeHook } from 'payload'

import { revalidateNavCounts } from '../lib/nav-cache'
import { mailHtmlToText } from '../lib/sanitize'

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'object' && value !== null) {
    return Number((value as { id: number | string }).id)
  }
  return null
}

// Keeps the parent thread's denormalized fields in sync whenever a message is
// created: bumps the sort key + preview, marks it unread for the other party,
// and re-shows the thread to anyone who deleted it (Gmail-style resurface).
export const syncThreadOnMessage: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return

  const threadId = idOf(doc.thread)
  const senderId = idOf(doc.sender)
  if (!threadId) return

  const thread = await req.payload.findByID({
    collection: 'threads',
    id: threadId,
    depth: 0,
    req,
  })

  const participants = (Array.isArray(thread.participants) ? thread.participants : [])
    .map(idOf)
    .filter((id): id is number => id !== null)

  // Bodies are HTML — strip tags for the inbox preview line.
  const snippet = mailHtmlToText(String(doc.body ?? ''))

  const recipients = participants.filter((id) => id !== senderId)

  await req.payload.update({
    collection: 'threads',
    id: threadId,
    data: {
      lastSender: senderId,
      lastMessageAt: doc.createdAt,
      lastSnippet: snippet.length > 120 ? `${snippet.slice(0, 120)}…` : snippet,
      messageCount: (thread.messageCount ?? 0) + 1,
      unreadFor: recipients,
      visibleTo: participants,
    },
    req,
  })

  // Bump the mail badge for everyone who now has unread mail.
  for (const recipientId of recipients) {
    revalidateNavCounts(recipientId)
  }
}

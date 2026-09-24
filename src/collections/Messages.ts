import type { Access, CollectionConfig } from 'payload'

import { isAdmin, isAdminField, isAuthenticated } from '../access'
import { syncThreadOnMessage } from '../hooks/syncThreadOnMessage'
import { sanitizeMailHtml } from '../lib/sanitize'

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null) {
    const id = (value as { id: number | string }).id
    return typeof id === 'number' ? id : Number(id)
  }
  return null
}

const isParticipantOrAdmin: Access = ({ req }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  return {
    participants: { contains: user.id },
  }
}

export const Messages: CollectionConfig = {
  slug: 'messages',
  admin: {
    defaultColumns: ['sender', 'thread', 'createdAt'],
  },
  access: {
    create: isAuthenticated,
    read: isParticipantOrAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || operation !== 'create') return data

        // Bodies arrive as rich-text HTML — sanitize no matter the entry point.
        if (typeof data.body === 'string') {
          data.body = sanitizeMailHtml(data.body)
        }

        if (req.user && (!data.sender || req.user.role !== 'admin')) {
          data.sender = req.user.id
        }

        const threadId = idOf(data.thread)
        const senderId = idOf(data.sender)
        if (!threadId) return data

        const thread = await req.payload.findByID({
          collection: 'threads',
          id: threadId,
          depth: 0,
          req,
        })

        const participants = (Array.isArray(thread.participants) ? thread.participants : [])
          .map(idOf)
          .filter((id): id is number => id !== null)

        // Guest senders have no user row — they carry a display name instead.
        if (senderId) {
          if (!participants.includes(senderId)) {
            throw new Error('You are not a participant in this thread.')
          }
        } else if (typeof data.senderName !== 'string' || !data.senderName.trim()) {
          throw new Error('A message needs a sender.')
        }

        // Denormalized copy so `read` access can stay a query constraint.
        data.participants = participants

        return data
      },
    ],
    afterChange: [syncThreadOnMessage],
  },
  fields: [
    {
      name: 'thread',
      type: 'relationship',
      relationTo: 'threads',
      required: true,
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'sender',
      type: 'relationship',
      relationTo: 'users',
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'senderName',
      type: 'text',
      maxLength: 120,
      admin: {
        description: 'Display name for guest (signed-out) senders.',
      },
    },
    {
      name: 'senderContact',
      type: 'text',
      maxLength: 200,
      admin: {
        description: 'How the recipient can reach a guest sender.',
      },
    },
    {
      name: 'participants',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      index: true,
      admin: {
        hidden: true,
      },
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      maxLength: 20000,
    },
    {
      name: 'attachments',
      type: 'upload',
      relationTo: 'mail-attachments',
      hasMany: true,
      access: {
        update: isAdminField,
      },
    },
  ],
  timestamps: true,
}

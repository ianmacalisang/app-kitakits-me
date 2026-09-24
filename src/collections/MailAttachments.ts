import type { Access, CollectionConfig, Where } from 'payload'

import { isAdmin, isAdminField, isAuthenticated } from '../access'
import { MAIL_ATTACHMENT_MIME_TYPES } from '../lib/mail-attachments'

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null) {
    const id = (value as { id: number | string }).id
    return typeof id === 'number' ? id : Number(id)
  }
  return null
}

// Attachments are only readable by their uploader, the thread's
// participants, and admins. `participants` is denormalized from the thread
// on create so this stays a query constraint instead of an async lookup.
const isUploaderOrParticipantOrAdmin: Access = ({ req }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  const where: Where = {
    or: [{ uploader: { equals: user.id } }, { participants: { contains: user.id } }],
  }
  return where
}

export const MailAttachments: CollectionConfig = {
  slug: 'mail-attachments',
  access: {
    create: isAuthenticated,
    read: isUploaderOrParticipantOrAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || operation !== 'create') return data

        if (req.user && (!data.uploader || req.user.role !== 'admin')) {
          data.uploader = req.user.id
        }

        // Copy the thread's participants so read access can stay a query
        // constraint — callers never set this field directly.
        const threadId = idOf(data.thread)
        if (threadId) {
          const thread = await req.payload.findByID({
            collection: 'threads',
            id: threadId,
            depth: 0,
            req,
          })
          data.participants = (Array.isArray(thread.participants) ? thread.participants : [])
            .map(idOf)
            .filter((id): id is number => id !== null)
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'uploader',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'thread',
      type: 'relationship',
      relationTo: 'threads',
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'participants',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        hidden: true,
      },
      access: {
        update: isAdminField,
      },
    },
  ],
  upload: {
    staticDir: 'mail-attachments',
    // SVG/HTML are deliberately excluded — same-origin scriptable types
    // could run in the app's origin when the file is served back.
    mimeTypes: [...MAIL_ATTACHMENT_MIME_TYPES],
  },
  timestamps: true,
}

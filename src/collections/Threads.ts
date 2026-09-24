import type { Access, CollectionConfig } from 'payload'

import { isAdmin, isAdminField, isAuthenticated } from '../access'

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

export const Threads: CollectionConfig = {
  slug: 'threads',
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'participants', 'lastMessageAt', 'messageCount'],
  },
  access: {
    create: isAuthenticated,
    read: isParticipantOrAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation }) => {
        if (!data || operation !== 'create') return data

        const participants = (Array.isArray(data.participants) ? data.participants : [])
          .map(idOf)
          .filter((id): id is number => id !== null)

        // Guest mail (a signed-out visitor writing via a public profile) has a
        // single participant — the recipient — plus the guest's name.
        const guest = typeof data.guestName === 'string' && data.guestName.trim().length > 0
        if (guest) {
          if (participants.length !== 1) {
            throw new Error('A guest thread needs exactly one participant — the recipient.')
          }
        } else if (participants.length !== 2 || new Set(participants).size !== 2) {
          throw new Error('A thread needs exactly two participants.')
        }

        if (req.user && req.user.role !== 'admin' && !participants.includes(req.user.id)) {
          throw new Error('You can only start mail you are a part of.')
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'participants',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      required: true,
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'subject',
      type: 'text',
      required: true,
      maxLength: 150,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'guestName',
      type: 'text',
      maxLength: 120,
      admin: {
        description: 'Display name when the thread was started by a signed-out visitor.',
      },
    },
    {
      name: 'guestContact',
      type: 'text',
      maxLength: 200,
      admin: {
        description: 'How the recipient can reach the guest sender.',
      },
    },
    {
      name: 'visibleTo',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      required: true,
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'unreadFor',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'lastSender',
      type: 'relationship',
      relationTo: 'users',
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'lastMessageAt',
      type: 'date',
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'lastSnippet',
      type: 'text',
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'messageCount',
      type: 'number',
      defaultValue: 0,
      access: {
        update: isAdminField,
      },
    },
  ],
  timestamps: true,
}

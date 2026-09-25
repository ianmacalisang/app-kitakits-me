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
  endpoints: [
    // REST entry points for clients that can't use server actions (iOS app).
    // Threads are admin-update-only, so mark-read and hide live here and
    // enforce participant access themselves.
    {
      path: '/:id/read',
      method: 'post',
      handler: async (req) => {
        const user = req.user
        if (!user) return Response.json({ message: 'Unauthorized' }, { status: 401 })

        const threadId = Number(req.routeParams?.id)
        if (!Number.isInteger(threadId)) {
          return Response.json({ message: 'Invalid thread id' }, { status: 400 })
        }

        let thread
        try {
          thread = await req.payload.findByID({
            collection: 'threads',
            id: threadId,
            depth: 0,
            user,
            overrideAccess: false,
          })
        } catch {
          return Response.json({ message: 'Thread not found' }, { status: 404 })
        }

        const unreadFor = (Array.isArray(thread.unreadFor) ? thread.unreadFor : [])
          .map((p: unknown) =>
            typeof p === 'object' && p !== null ? (p as { id: number }).id : (p as number),
          )
          .filter((id): id is number => typeof id === 'number' && id !== user.id)

        // System write — non-admin users can't update threads directly.
        await req.payload.update({
          collection: 'threads',
          id: threadId,
          data: { unreadFor },
        })

        return Response.json({ success: true })
      },
    },
    {
      path: '/:id/hide',
      method: 'post',
      handler: async (req) => {
        const user = req.user
        if (!user) return Response.json({ message: 'Unauthorized' }, { status: 401 })

        const threadId = Number(req.routeParams?.id)
        if (!Number.isInteger(threadId)) {
          return Response.json({ message: 'Invalid thread id' }, { status: 400 })
        }

        let thread
        try {
          thread = await req.payload.findByID({
            collection: 'threads',
            id: threadId,
            depth: 0,
            user,
            overrideAccess: false,
          })
        } catch {
          return Response.json({ message: 'Thread not found' }, { status: 404 })
        }

        const visibleTo = (Array.isArray(thread.visibleTo) ? thread.visibleTo : [])
          .map((p: unknown) =>
            typeof p === 'object' && p !== null ? (p as { id: number }).id : (p as number),
          )
          .filter((id): id is number => typeof id === 'number' && id !== user.id)

        // Nobody can see the thread anymore — delete it outright along with
        // its messages and attachments. (visibleTo is required, so writing an
        // empty list would fail validation anyway.)
        if (visibleTo.length === 0) {
          await req.payload.delete({
            collection: 'messages',
            where: { thread: { equals: threadId } },
          })
          await req.payload.delete({
            collection: 'mail-attachments',
            where: { thread: { equals: threadId } },
          })
          await req.payload.delete({ collection: 'threads', id: threadId })
        } else {
          await req.payload.update({
            collection: 'threads',
            id: threadId,
            data: { visibleTo },
          })
        }

        return Response.json({ success: true })
      },
    },
  ],
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

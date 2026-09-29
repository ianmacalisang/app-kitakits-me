import type { Access, CollectionConfig, Where } from 'payload'

import { isAdmin, isAuthenticated } from '../access'

// Rooms are readable by members and invitees alike — an invitee needs to see
// who called them before deciding to accept. `invites.user` is an array-field
// dot path the Postgres adapter resolves but the generated Where type doesn't
// spell out — hence the cast.
const isRoomPartyOrAdmin: Access = ({ req }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  return {
    or: [{ members: { contains: user.id } }, { 'invites.user': { equals: user.id } }],
  } as Where
}

export const VideokeRooms: CollectionConfig = {
  slug: 'videoke-rooms',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'host', 'status', 'createdAt'],
  },
  access: {
    create: isAuthenticated,
    read: isRoomPartyOrAdmin,
    // All mutations (invites, queue, playback) go through server actions that
    // enforce their own rules and write with system access — same shape as
    // Threads' admin-update-only pattern.
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation }) => {
        if (!data || operation !== 'create') return data
        if (req.user) data.host = req.user.id
        data.members = req.user ? [req.user.id] : []
        data.invites = []
        data.status = 'open'
        return data
      },
    ],
  },
  fields: [
    {
      name: 'host',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'name',
      type: 'text',
      maxLength: 80,
    },
    {
      name: 'members',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      required: true,
      index: true,
    },
    {
      name: 'invites',
      type: 'array',
      admin: {
        description: 'Pending invitations — invitee, who invited them, and when.',
      },
      fields: [
        {
          name: 'user',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          index: true,
        },
        { name: 'invitedBy', type: 'relationship', relationTo: 'users' },
        { name: 'invitedAt', type: 'date' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      options: ['open', 'ended'],
      defaultValue: 'open',
      index: true,
    },
    {
      name: 'playback',
      type: 'group',
      fields: [
        {
          name: 'item',
          type: 'relationship',
          relationTo: 'videoke-queue-items',
        },
        {
          name: 'state',
          type: 'select',
          options: ['idle', 'playing', 'paused'],
          defaultValue: 'idle',
        },
        // Server timestamp of the last play/resume — clients derive the live
        // position as positionSec + (now - startedAt).
        { name: 'startedAt', type: 'date' },
        { name: 'positionSec', type: 'number', defaultValue: 0 },
      ],
    },
  ],
  timestamps: true,
}

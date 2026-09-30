import type { Access, CollectionConfig, Where } from 'payload'

import { isAdmin, isAdminField, isAuthenticated } from '../access'

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

export const CardRooms: CollectionConfig = {
  slug: 'card-rooms',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'host', 'status', 'createdAt'],
  },
  access: {
    create: isAuthenticated,
    read: isRoomPartyOrAdmin,
    // All mutations (invites, deals, draws) go through server actions that
    // enforce their own rules and write with system access — same shape as
    // VideokeRooms.
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
      // A card table tops out at 8 — the deck is only 49 cards.
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
      name: 'game',
      type: 'group',
      fields: [
        {
          name: 'variant',
          type: 'select',
          options: ['unggoy'],
          defaultValue: 'unggoy',
          required: true,
        },
        {
          name: 'state',
          type: 'select',
          options: ['lobby', 'playing', 'finished'],
          defaultValue: 'lobby',
        },
        {
          // Bumps per deal — point-award dedupe keys are scoped by round.
          name: 'round',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'seats',
          type: 'array',
          admin: {
            description: 'Seat order (clockwise) — fixed at deal time for the round.',
          },
          fields: [
            { name: 'user', type: 'relationship', relationTo: 'users', required: true },
          ],
        },
        {
          name: 'hands',
          type: 'array',
          // Hidden information — members can read the room doc via REST, so
          // hands are field-gated to admins; server actions re-read with
          // system access and serialize a per-player view instead.
          access: {
            read: isAdminField,
          },
          admin: {
            description: 'Live hands keyed by user — card codes stay pair-free between draws.',
          },
          fields: [
            { name: 'user', type: 'relationship', relationTo: 'users', required: true },
            { name: 'cards', type: 'json' },
          ],
        },
        {
          // Index into seats — the player whose draw it is.
          name: 'turnSeat',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'lastDraw',
          type: 'group',
          fields: [
            { name: 'by', type: 'relationship', relationTo: 'users' },
            { name: 'from', type: 'relationship', relationTo: 'users' },
            { name: 'paired', type: 'checkbox' },
          ],
        },
        {
          name: 'loser',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            description: 'Set on finish — the player left holding the unggoy.',
          },
        },
      ],
    },
  ],
  timestamps: true,
}

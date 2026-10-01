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

export const NhieRooms: CollectionConfig = {
  slug: 'nhie-rooms',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'host', 'status', 'createdAt'],
  },
  access: {
    create: isAuthenticated,
    read: isRoomPartyOrAdmin,
    // All mutations (invites, prompts, answers) go through server actions that
    // enforce their own rules and write with system access — same shape as
    // CardRooms.
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
      name: 'game',
      type: 'group',
      fields: [
        {
          name: 'state',
          type: 'select',
          options: ['lobby', 'playing', 'finished'],
          defaultValue: 'lobby',
        },
        {
          // Bumps per game — point-award dedupe keys are scoped by round.
          name: 'round',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'seats',
          type: 'array',
          admin: {
            description: 'Seat order (turn rotation) — fixed at deal time for the game.',
          },
          fields: [
            { name: 'user', type: 'relationship', relationTo: 'users', required: true },
          ],
        },
        {
          name: 'fingers',
          type: 'array',
          admin: {
            description: 'Fingers remaining per seated player — zero means out.',
          },
          fields: [
            { name: 'user', type: 'relationship', relationTo: 'users', required: true },
            { name: 'count', type: 'number', required: true, defaultValue: 5 },
          ],
        },
        {
          // Index into seats — the player supplying the next prompt.
          name: 'turnSeat',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'prompt',
          type: 'group',
          fields: [
            { name: 'text', type: 'text', maxLength: 140 },
            { name: 'by', type: 'relationship', relationTo: 'users' },
            {
              name: 'source',
              type: 'select',
              options: ['deck', 'custom'],
              defaultValue: 'deck',
            },
          ],
        },
        {
          // Hidden information — members can read the room doc via REST, so
          // responses are field-gated to admins; server actions re-read with
          // system access and serialize a per-player view instead. Revealing
          // answers early would let the circle bandwagon.
          name: 'responses',
          type: 'array',
          access: {
            read: isAdminField,
          },
          admin: {
            description: 'Answers to the current prompt, keyed by user.',
          },
          fields: [
            { name: 'user', type: 'relationship', relationTo: 'users', required: true },
            { name: 'answer', type: 'select', options: ['have', 'never'], required: true },
          ],
        },
        {
          // Deck indexes already drawn this game — kept so a prompt never
          // repeats before the deck recycles.
          name: 'usedPrompts',
          type: 'json',
        },
        {
          // Snapshot of the last resolve for the reveal ticker — which
          // prompt dropped which fingers.
          name: 'lastResult',
          type: 'group',
          fields: [
            { name: 'text', type: 'text' },
            { name: 'drops', type: 'json' },
          ],
        },
        {
          name: 'winner',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            description: 'Set on finish — the last player with fingers up.',
          },
        },
      ],
    },
  ],
  timestamps: true,
}

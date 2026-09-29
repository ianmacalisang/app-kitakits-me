import type { CollectionConfig } from 'payload'

import { isAdmin, isAuthenticated } from '../access'

export const VideokeQueueItems: CollectionConfig = {
  slug: 'videoke-queue-items',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'room', 'state', 'position'],
  },
  access: {
    // Actions do the real validation (open room, membership, channel-owned
    // video) — the collection just requires a signed-in user for creates.
    // Every read path in the app is a system read after a room-membership
    // check, so raw item docs stay admin-only (same shape as Threads).
    create: isAuthenticated,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  indexes: [{ fields: ['room', 'state'] }],
  fields: [
    {
      name: 'room',
      type: 'relationship',
      relationTo: 'videoke-rooms',
      required: true,
      index: true,
    },
    { name: 'videoId', type: 'text', required: true, maxLength: 20 },
    { name: 'title', type: 'text', required: true, maxLength: 300 },
    { name: 'thumbnail', type: 'text', maxLength: 500 },
    { name: 'durationSec', type: 'number' },
    {
      name: 'addedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'state',
      type: 'select',
      options: ['queued', 'playing', 'done', 'skipped'],
      defaultValue: 'queued',
      index: true,
    },
    // FIFO order among queued rows — next song = lowest position.
    { name: 'position', type: 'number', required: true, index: true },
  ],
  timestamps: true,
}

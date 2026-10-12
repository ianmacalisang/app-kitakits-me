import type { CollectionConfig } from 'payload'

import { isAdmin, isAuthenticated } from '../access'

// One row per (user, room) pair — createdAt is the first join, updatedAt the
// most recent. Re-joining a room bumps the row instead of appending, so the
// activity feed resurfaces it like re-views do for profile-views. The room
// reference is whichever of `room`/`cardRoom`/`nhieRoom` is set — a join
// targets exactly one hangout app.
export const HangoutJoins: CollectionConfig = {
  slug: 'hangout-joins',
  admin: {
    defaultColumns: ['user', 'room', 'cardRoom', 'nhieRoom', 'invitedBy', 'updatedAt'],
  },
  indexes: [
    { unique: true, fields: ['user', 'room'] },
    { unique: true, fields: ['user', 'cardRoom'] },
    { unique: true, fields: ['user', 'nhieRoom'] },
    // Serves the activities feed's user_id IN (...) ORDER BY updated_at.
    { fields: ['user', 'updatedAt'] },
  ],
  access: {
    // Reads feed the activities stream — the query scopes rows to followed
    // actors, so any signed-in member may read them.
    read: isAuthenticated,
    // All writes go through the videoke room actions with system access.
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        update: () => false,
      },
    },
    {
      name: 'room',
      type: 'relationship',
      relationTo: 'videoke-rooms',
      index: true,
      access: {
        update: () => false,
      },
    },
    {
      name: 'cardRoom',
      type: 'relationship',
      relationTo: 'card-rooms',
      index: true,
      access: {
        update: () => false,
      },
    },
    {
      name: 'nhieRoom',
      type: 'relationship',
      relationTo: 'nhie-rooms',
      index: true,
      access: {
        update: () => false,
      },
    },
    {
      name: 'invitedBy',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      // 'hosted' — the actor created the room; 'joined' — they came in via an
      // invite. Drives the activity-feed wording.
      name: 'kind',
      type: 'select',
      options: ['joined', 'hosted'],
      defaultValue: 'joined',
      required: true,
    },
  ],
  timestamps: true,
}

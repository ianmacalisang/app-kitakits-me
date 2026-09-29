import type { CollectionConfig } from 'payload'

import { isAdmin, isOwnerOrAdmin } from '../access'
import { pointEventApplied } from '../hooks/gamification'

// Append-only ledger behind users.points. `key` is a per-event dedupe key
// (e.g. `like:{postId}:{likerId}`) — a conflict means the event was already
// awarded, so the points bump is skipped. That keeps awards idempotent and
// blocks unlike→re-like farming without any decrement logic.
export const POINT_KINDS = [
  { label: 'Post authored', value: 'post' },
  { label: 'Comment authored', value: 'comment' },
  { label: 'Like received', value: 'like-received' },
  { label: 'Comment received', value: 'comment-received' },
  { label: 'Share received', value: 'share-received' },
  { label: 'Save received', value: 'save-received' },
  { label: 'Follower gained', value: 'follow-received' },
  { label: 'Testimonial received (approved)', value: 'testimonial-received' },
  { label: 'Testimonial written (approved)', value: 'testimonial-given' },
  { label: 'Admin adjustment', value: 'manual' },
] as const

export const PointEvents: CollectionConfig = {
  slug: 'point-events',
  admin: {
    defaultColumns: ['user', 'kind', 'points', 'createdAt'],
  },
  access: {
    // The ledger is semi-private — a user can audit their own history.
    read: isOwnerOrAdmin('user'),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [pointEventApplied],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'kind',
      type: 'select',
      options: [...POINT_KINDS],
      required: true,
      index: true,
    },
    {
      name: 'points',
      type: 'number',
      required: true,
    },
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      index: true,
    },
    {
      name: 'key',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description: 'Dedupe key — awards with an existing key are skipped.',
      },
    },
  ],
  timestamps: true,
}

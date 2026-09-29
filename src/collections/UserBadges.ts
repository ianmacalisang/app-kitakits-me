import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access'
import { badgeAwardNotification } from '../hooks/gamification'

export const UserBadges: CollectionConfig = {
  slug: 'user-badges',
  admin: {
    defaultColumns: ['user', 'badge', 'createdAt'],
  },
  // One award per badge per user — the evaluator relies on this constraint
  // to make concurrent grants idempotent.
  indexes: [{ unique: true, fields: ['user', 'badge'] }],
  access: {
    // Awards are public-facing — shown on public /@username profiles.
    read: () => true,
    // System grants and manual admin awards both flow through admin writes
    // (hooks bypass access); regular users never write rows directly.
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [badgeAwardNotification],
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
      name: 'badge',
      type: 'relationship',
      relationTo: 'badges',
      required: true,
      index: true,
    },
  ],
  timestamps: true,
}

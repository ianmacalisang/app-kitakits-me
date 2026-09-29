import type { Access, CollectionConfig } from 'payload'

import { isAdmin, isAdminField } from '../access'

const isRecipientOrAdmin: Access = ({ req }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  return {
    recipient: { equals: user.id },
  }
}

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: {
    defaultColumns: ['recipient', 'actor', 'type', 'read', 'createdAt'],
  },
  // Composite index speeds up the unread-count query in AppLayout
  // (recipient + read) and list queries (recipient alone uses the same index).
  indexes: [{ fields: ['recipient', 'read'] }],
  access: {
    create: isAdmin,
    read: isRecipientOrAdmin,
    update: isRecipientOrAdmin,
    delete: isRecipientOrAdmin,
  },
  fields: [
    {
      name: 'recipient',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'type',
      type: 'select',
      options: ['like', 'comment', 'follow', 'testimonial', 'badge'],
      required: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'comment',
      type: 'relationship',
      relationTo: 'comments',
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'testimonial',
      type: 'relationship',
      relationTo: 'testimonials',
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'badge',
      type: 'relationship',
      relationTo: 'badges',
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'read',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
  ],
  timestamps: true,
}

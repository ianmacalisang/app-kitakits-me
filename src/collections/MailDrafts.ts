import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwner } from '../access'
import { sanitizeMailHtml } from '../lib/sanitize'

export const MailDrafts: CollectionConfig = {
  slug: 'mail-drafts',
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'recipient', 'author', 'updatedAt'],
  },
  access: {
    create: isAuthenticated,
    read: isOwner('author'),
    update: isOwner('author'),
    delete: isOwner('author'),
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation }) => {
        if (!data) return data

        // Drafts reuse the mail body allowlist so resumed content stays safe.
        if (typeof data.body === 'string' && data.body) {
          data.body = sanitizeMailHtml(data.body)
        }

        if (operation === 'create' && req.user && (!data.author || req.user.role !== 'admin')) {
          data.author = req.user.id
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      // Resolved recipient picked from autocomplete — lets the composer
      // restore the chip. `to` keeps whatever was typed but not resolved.
      name: 'recipient',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'to',
      type: 'text',
      maxLength: 80,
    },
    {
      name: 'subject',
      type: 'text',
      maxLength: 150,
    },
    {
      name: 'body',
      type: 'textarea',
      maxLength: 20000,
    },
  ],
  timestamps: true,
}

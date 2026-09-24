import type { CollectionConfig } from 'payload'

import { isAdmin, isAuthenticated } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: isAuthenticated,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
  ],
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*'],
  },
}

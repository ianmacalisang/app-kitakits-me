import type { CollectionConfig } from 'payload'

import { canSave, isOwnerOrAdmin } from '../access'
import { parallelAfterChange } from '../hooks/afterChangeParallel'
import { saveCounter } from '../hooks/postCounters'
import { savePoints } from '../hooks/gamification'

const idOf = (value: unknown): number | string | null =>
  typeof value === 'object' && value !== null
    ? ((value as { id: number | string }).id ?? null)
    : ((value as number | string) ?? null)

export const Saves: CollectionConfig = {
  slug: 'saves',
  admin: {
    defaultColumns: ['user', 'post', 'createdAt'],
  },
  indexes: [{ unique: true, fields: ['user', 'post'] }],
  access: {
    create: canSave,
    // Saves are private — only the owner (and admins) can read them.
    read: isOwnerOrAdmin('user'),
    update: () => false,
    delete: isOwnerOrAdmin('user'),
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || operation !== 'create') return data

        if (req.user && (!data.user || req.user.role !== 'admin')) {
          data.user = req.user.id
        }

        const userId = idOf(data.user)
        const postId = idOf(data.post)

        if (userId && postId) {
          const existing = await req.payload.count({
            collection: 'saves',
            where: {
              and: [{ user: { equals: userId } }, { post: { equals: postId } }],
            },
            req,
          })
          if (existing.totalDocs > 0) {
            throw new Error('You have already saved this post.')
          }
        }

        return data
      },
    ],
    afterChange: [parallelAfterChange(saveCounter.onCreate, savePoints)],
    afterDelete: [saveCounter.onDelete],
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
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      required: true,
      index: true,
    },
  ],
  timestamps: true,
}

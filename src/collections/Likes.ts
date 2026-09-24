import type { CollectionConfig } from 'payload'

import { canLike, isAuthenticated, isOwnerOrAdmin } from '../access'
import { createLikeNotification } from '../hooks/createLikeNotification'

const idOf = (value: unknown): number | string | null =>
  typeof value === 'object' && value !== null
    ? ((value as { id: number | string }).id ?? null)
    : ((value as number | string) ?? null)

export const Likes: CollectionConfig = {
  slug: 'likes',
  admin: {
    defaultColumns: ['user', 'post', 'createdAt'],
  },
  indexes: [{ unique: true, fields: ['user', 'post'] }],
  access: {
    create: canLike,
    read: isAuthenticated,
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
            collection: 'likes',
            where: {
              and: [{ user: { equals: userId } }, { post: { equals: postId } }],
            },
            req,
          })
          if (existing.totalDocs > 0) {
            throw new Error('You have already liked this post.')
          }
        }

        return data
      },
    ],
    afterChange: [createLikeNotification],
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

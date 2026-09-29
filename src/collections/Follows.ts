import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwnerOrAdmin } from '../access'
import { createFollowNotification } from '../hooks/createFollowNotification'
import { followPoints } from '../hooks/gamification'

const idOf = (value: unknown): number | string | null =>
  typeof value === 'object' && value !== null
    ? ((value as { id: number | string }).id ?? null)
    : ((value as number | string) ?? null)

export const Follows: CollectionConfig = {
  slug: 'follows',
  admin: {
    defaultColumns: ['follower', 'following', 'createdAt'],
  },
  indexes: [{ unique: true, fields: ['follower', 'following'] }],
  access: {
    create: isAuthenticated,
    read: isAuthenticated,
    update: () => false,
    delete: isOwnerOrAdmin('follower'),
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || operation !== 'create') return data

        if (req.user && (!data.follower || req.user.role !== 'admin')) {
          data.follower = req.user.id
        }

        const followerId = idOf(data.follower)
        const followingId = idOf(data.following)

        if (followerId && followingId && followerId === followingId) {
          throw new Error('You cannot follow yourself.')
        }

        if (followerId && followingId) {
          const existing = await req.payload.count({
            collection: 'follows',
            where: {
              and: [{ follower: { equals: followerId } }, { following: { equals: followingId } }],
            },
            req,
          })
          if (existing.totalDocs > 0) {
            throw new Error('You are already following this user.')
          }
        }

        return data
      },
    ],
    afterChange: [createFollowNotification, followPoints],
  },
  fields: [
    {
      name: 'follower',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'following',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
  ],
  timestamps: true,
}

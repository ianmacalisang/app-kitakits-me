import type { Access, CollectionConfig, Where } from 'payload'

import { isOwner } from '../access'

const idOf = (value: unknown): number | string | null =>
  typeof value === 'object' && value !== null
    ? ((value as { id: number | string }).id ?? null)
    : ((value as number | string) ?? null)

// Recording is reciprocal: only members who turned on "Who viewed your
// profile" in privacy settings may write view rows — and the same flag is
// what lets them see their own viewers.
const isOptedInViewer: Access = ({ req }) => Boolean(req.user?.profileViewTracking)

// Either side can reach a row — the owner listing their viewers, or the
// viewer reading/removing a visit they recorded (its `viewed` field only
// reveals a profile they already visited). The activity feed further
// filters to `viewed = me` rows whose viewers still have tracking on.
const isPartyOrAdmin: Access = ({ req }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  const constraint: Where = {
    or: [{ viewer: { equals: user.id } }, { viewed: { equals: user.id } }],
  }
  return constraint
}

export const ProfileViews: CollectionConfig = {
  slug: 'profile-views',
  admin: {
    defaultColumns: ['viewer', 'viewed', 'viewCount', 'updatedAt'],
  },
  // One row per (viewer, viewed) pair — createdAt is the first view,
  // updatedAt the most recent; re-views bump the row instead of appending.
  indexes: [
    { unique: true, fields: ['viewer', 'viewed'] },
    // Serves the activities feed's viewed_id = me ORDER BY updated_at.
    { fields: ['viewed', 'updatedAt'] },
  ],
  access: {
    create: isOptedInViewer,
    read: isPartyOrAdmin,
    update: isOwner('viewer'),
    delete: isPartyOrAdmin,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || operation !== 'create') return data

        if (req.user && (!data.viewer || req.user.role !== 'admin')) {
          data.viewer = req.user.id
        }

        const viewerId = idOf(data.viewer)
        const viewedId = idOf(data.viewed)

        if (viewerId && viewedId && viewerId === viewedId) {
          throw new Error('You cannot record a view on your own profile.')
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'viewer',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        update: () => false,
      },
    },
    {
      name: 'viewed',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        update: () => false,
      },
    },
    {
      name: 'viewCount',
      type: 'number',
      defaultValue: 1,
      min: 1,
    },
  ],
  timestamps: true,
}

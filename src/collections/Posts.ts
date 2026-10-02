import type { CollectionConfig } from 'payload'

import { canReadPosts, isAdminField, isAuthenticated, isOwner } from '../access'
import { POST_CATEGORIES } from '../lib/categories'
import { parallelAfterChange } from '../hooks/afterChangeParallel'
import { deletePostDependents } from '../hooks/deletePostDependents'
import { deletePostMedia, deleteRemovedPostMedia } from '../hooks/deletePostMedia'
import { deletePostVideo, deleteRemovedPostVideo } from '../hooks/deletePostVideo'
import { shareCounterCreate, shareCounterDelete } from '../hooks/postCounters'
import { postPoints } from '../hooks/gamification'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    defaultColumns: ['author', 'content', 'createdAt'],
  },
  access: {
    create: isAuthenticated,
    read: canReadPosts,
    update: isOwner('author'),
    delete: isOwner('author'),
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        if (operation === 'create' && req.user) {
          if (!data.author || req.user.role !== 'admin') {
            data.author = req.user.id
          }
        }

        const content = data?.content ?? originalDoc?.content
        const image = data?.image ?? originalDoc?.image
        const video = data?.video ?? originalDoc?.video
        const sharedPost = data?.sharedPost ?? originalDoc?.sharedPost
        const imageCount = Array.isArray(image) ? image.length : image ? 1 : 0
        if ((!content || !content.trim()) && imageCount === 0 && !video && !sharedPost) {
          throw new Error('A post must have text or an image.')
        }

        return data
      },
    ],
    beforeDelete: [deletePostDependents],
    afterDelete: [deletePostMedia, deletePostVideo, shareCounterDelete],
    afterChange: [
      parallelAfterChange(
        deleteRemovedPostMedia,
        deleteRemovedPostVideo,
        shareCounterCreate,
        postPoints,
      ),
    ],
  },
  fields: [
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'visibility',
      type: 'select',
      options: [
        { label: 'Public', value: 'public' },
        { label: 'Followers only', value: 'followers' },
        { label: 'Mutuals only', value: 'mutuals' },
      ],
      defaultValue: 'public',
      index: true,
    },
    {
      name: 'category',
      type: 'select',
      options: POST_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
      defaultValue: 'kwento',
      required: true,
      index: true,
    },
    {
      name: 'content',
      type: 'textarea',
      maxLength: 2000,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
    },
    {
      name: 'video',
      type: 'relationship',
      relationTo: 'videos',
      index: true,
    },
    {
      name: 'sharedPost',
      type: 'relationship',
      relationTo: 'posts',
      index: true,
    },
    {
      name: 'pinned',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    // Denormalized engagement counters — maintained by the counter hooks on
    // likes/comments/saves/posts so feeds read them off the row instead of
    // scanning the relations. Backfilled by scripts/backfill-post-counters.ts.
    {
      name: 'likeCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'commentCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'shareCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'saveCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
  ],
  timestamps: true,
}

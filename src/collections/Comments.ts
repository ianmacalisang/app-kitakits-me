import type { CollectionConfig } from 'payload'

import { canComment, canReadComments, isAdminField, isOwner } from '../access'
import { createCommentNotification } from '../hooks/createCommentNotification'
import { deleteCommentNotifications } from '../hooks/deleteCommentNotifications'
import { commentCounter } from '../hooks/postCounters'

export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    defaultColumns: ['author', 'post', 'content', 'createdAt'],
  },
  access: {
    create: canComment,
    read: canReadComments,
    update: isOwner('author'),
    delete: isOwner('author'),
  },
  hooks: {
    beforeValidate: [
      ({ data, req, operation }) => {
        if (!data) return data
        if (operation === 'create' && req.user) {
          if (!data.author || req.user.role !== 'admin') {
            data.author = req.user.id
          }
        }
        return data
      },
    ],
    afterChange: [createCommentNotification, commentCounter.onCreate],
    beforeDelete: [deleteCommentNotifications],
    afterDelete: [commentCounter.onDelete],
  },
  fields: [
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      required: true,
      index: true,
    },
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
      name: 'content',
      type: 'textarea',
      required: true,
      maxLength: 1000,
    },
  ],
  timestamps: true,
}

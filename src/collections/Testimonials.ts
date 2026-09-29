import type { CollectionConfig } from 'payload'

import {
  canReadTestimonials,
  canWriteTestimonial,
  isAdminField,
  isTestimonialAuthorField,
  isTestimonialParty,
  isTestimonialRecipientField,
} from '../access'
import { createTestimonialNotification } from '../hooks/createTestimonialNotification'
import { testimonialPoints } from '../hooks/gamification'
import { deleteTestimonialNotifications } from '../hooks/deleteTestimonialNotifications'

const idOf = (value: unknown): number | string | null =>
  typeof value === 'object' && value !== null
    ? ((value as { id: number | string }).id ?? null)
    : ((value as number | string) ?? null)

export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  admin: {
    defaultColumns: ['author', 'recipient', 'status', 'createdAt'],
  },
  // One testimonial per author per profile — the author edits to revise.
  indexes: [{ unique: true, fields: ['author', 'recipient'] }],
  access: {
    create: canWriteTestimonial,
    read: canReadTestimonials,
    update: isTestimonialParty,
    delete: isTestimonialParty,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || operation !== 'create') return data

        if (req.user && (!data.author || req.user.role !== 'admin')) {
          data.author = req.user.id
        }
        if (req.user?.role !== 'admin') {
          data.status = 'pending'
        }

        const authorId = idOf(data.author)
        const recipientId = idOf(data.recipient)

        if (authorId && recipientId && authorId === recipientId) {
          throw new Error('You cannot write a testimonial for yourself.')
        }

        if (authorId && recipientId) {
          const existing = await req.payload.count({
            collection: 'testimonials',
            where: {
              and: [{ author: { equals: authorId } }, { recipient: { equals: recipientId } }],
            },
            req,
          })
          if (existing.totalDocs > 0) {
            throw new Error('You have already written a testimonial for this user.')
          }
        }

        return data
      },
    ],
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        // Content edits require the recipient to approve again — otherwise an
        // author could rewrite an approved testimonial into something else.
        if (
          operation === 'update' &&
          originalDoc &&
          data.content !== undefined &&
          data.content !== originalDoc.content
        ) {
          data.status = 'pending'
        }
        return data
      },
    ],
    afterChange: [createTestimonialNotification, testimonialPoints],
    beforeDelete: [deleteTestimonialNotifications],
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
      name: 'content',
      type: 'textarea',
      required: true,
      maxLength: 1000,
      access: {
        update: isTestimonialAuthorField,
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      defaultValue: 'pending',
      index: true,
      access: {
        create: isAdminField,
        update: isTestimonialRecipientField,
      },
    },
  ],
  timestamps: true,
}

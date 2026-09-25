import type { CollectionConfig } from 'payload'

import { isAuthenticated, isOwnerOrAdmin } from '../access'

// Metadata for videos living on Bunny Stream — the file itself uploads
// directly from the browser to Bunny, so this is NOT an upload collection.
// HLS/thumbnail URLs are derived from bunnyVideoId at serialization time.
export const Videos: CollectionConfig = {
  slug: 'videos',
  admin: {
    defaultColumns: ['owner', 'status', 'bunnyVideoId', 'createdAt'],
  },
  access: {
    // Stream URLs are unguessable and public-read, same posture as media.
    read: () => true,
    create: isAuthenticated,
    update: isOwnerOrAdmin('owner'),
    delete: isOwnerOrAdmin('owner'),
  },
  fields: [
    {
      name: 'bunnyVideoId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Uploading', value: 'uploading' },
        { label: 'Processing', value: 'processing' },
        { label: 'Ready', value: 'ready' },
        { label: 'Failed', value: 'failed' },
      ],
      defaultValue: 'uploading',
      required: true,
      index: true,
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    // Filled in from Bunny's video object once encoding finishes.
    {
      name: 'duration',
      type: 'number',
      admin: { description: 'Seconds' },
    },
    { name: 'width', type: 'number' },
    { name: 'height', type: 'number' },
    {
      name: 'playCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true, description: 'How many times playback started' },
    },
  ],
  timestamps: true,
}

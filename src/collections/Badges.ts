import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access'

// Rules are evaluated in src/lib/gamification.ts — `manual` badges are only
// ever granted by an admin inserting a user-badges row, everything else is
// checked automatically whenever the user earns points or updates their
// profile.
export const BADGE_RULES = [
  { label: 'Posts authored', value: 'posts' },
  { label: 'Comments authored', value: 'comments' },
  { label: 'Likes received', value: 'likes-received' },
  { label: 'Followers', value: 'followers' },
  { label: 'Testimonials received (approved)', value: 'testimonials' },
  { label: 'Total points', value: 'points' },
  { label: 'Profile complete (avatar + bio)', value: 'profile-complete' },
  { label: 'Manual (admin grants)', value: 'manual' },
] as const

export const BADGE_ICONS = [
  { label: 'Sparkles', value: 'sparkles' },
  { label: 'Heart', value: 'heart' },
  { label: 'Users', value: 'users' },
  { label: 'Quote', value: 'quote' },
  { label: 'Trophy', value: 'trophy' },
  { label: 'Medal', value: 'medal' },
  { label: 'Star', value: 'star' },
  { label: 'Pin', value: 'pin' },
  { label: 'Megaphone', value: 'megaphone' },
] as const

export const Badges: CollectionConfig = {
  slug: 'badges',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'tier', 'rule', 'threshold', 'enabled'],
  },
  access: {
    // Badge definitions are public-facing — anonymous visitors see them on
    // public /@username profiles, so the REST read surface stays open.
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        // FK targets must go first — retiring a badge drops every award and
        // detaches the notifications that point at it.
        await req.payload.delete({
          collection: 'user-badges',
          where: { badge: { equals: id } },
          req,
        })
        await req.payload.update({
          collection: 'notifications',
          where: { badge: { equals: id } },
          data: { badge: null },
          req,
        })
      },
    ],
  },
  fields: [
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) =>
        typeof value === 'string' && /^[a-z0-9-]{2,60}$/.test(value)
          ? true
          : 'Slug must be 2–60 lowercase letters, numbers, and hyphens.',
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 80,
    },
    {
      name: 'description',
      type: 'textarea',
      maxLength: 300,
      admin: {
        description: 'Shown in the badge tooltip on profiles.',
      },
    },
    {
      name: 'icon',
      type: 'select',
      options: [...BADGE_ICONS],
      defaultValue: 'medal',
      required: true,
    },
    {
      name: 'tier',
      type: 'select',
      options: [
        { label: 'Bronze', value: 'bronze' },
        { label: 'Silver', value: 'silver' },
        { label: 'Gold', value: 'gold' },
      ],
      defaultValue: 'bronze',
      required: true,
      admin: {
        description: 'Chip styling on profiles — gold reads as the rarest.',
      },
    },
    {
      name: 'rule',
      type: 'select',
      options: [...BADGE_RULES],
      defaultValue: 'posts',
      required: true,
      index: true,
    },
    {
      name: 'threshold',
      type: 'number',
      min: 1,
      admin: {
        condition: (data) => data?.rule !== 'profile-complete' && data?.rule !== 'manual',
        description: 'Count needed to earn the badge.',
      },
      validate: (value: unknown, { data }: { data?: { rule?: string } }) => {
        if (data?.rule === 'profile-complete' || data?.rule === 'manual') return true
        return typeof value === 'number' && value >= 1
          ? true
          : 'Threshold is required for this rule.'
      },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Disabled badges stop auto-awarding but stay on profiles that already have them.',
      },
    },
    {
      name: 'sort',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Lower sorts first on the profile badge shelf.',
      },
    },
  ],
  timestamps: true,
}

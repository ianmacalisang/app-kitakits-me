import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminField, isAdminUser, isAuthenticated, isSelfOrAdmin } from '../access'
import { sendWelcomeEmail } from '../hooks/sendWelcomeEmail'
import { escapeHtml, resolveEmailBaseUrl } from '../lib/email'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'username',
  },
  auth: {
    forgotPassword: {
      generateEmailHTML: ({ req, token, user } = {}) => {
        const brand = req?.payload.email?.defaultFromName || 'Kitakits'
        const resetURL = `${resolveEmailBaseUrl(req)}/reset-password?token=${token}`
        const name = typeof user?.name === 'string' ? escapeHtml(user.name) : ''

        return `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#262626">
            <h2 style="margin:0 0 16px;font-size:20px">Reset your ${escapeHtml(brand)} password</h2>
            <p style="margin:0 0 16px;line-height:1.5">
              Hi${name ? ` ${name}` : ''}, we received a request to reset the password for your
              ${escapeHtml(brand)} account. Click the button below to choose a new password.
            </p>
            <p style="margin:0 0 16px">
              <a href="${resetURL}" style="display:inline-block;background:#047857;color:#ffffff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600">
                Reset password
              </a>
            </p>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#525252">
              This link expires in 1 hour. If the button doesn't work, paste this URL into your
              browser:<br /><a href="${resetURL}" style="color:#047857;word-break:break-all">${resetURL}</a>
            </p>
            <p style="margin:0;font-size:14px;line-height:1.5;color:#525252">
              If you didn't request a password reset, you can ignore this email — your password
              stays the same.
            </p>
          </div>
        `
      },
      generateEmailSubject: ({ req } = {}) =>
        `Reset your ${req?.payload.email?.defaultFromName || 'Kitakits'} password`,
    },
  },
  access: {
    admin: isAdminUser,
    create: () => true,
    read: isAuthenticated,
    update: isSelfOrAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [sendWelcomeEmail],
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      index: true,
      access: {
        update: isAdminField,
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'username',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) =>
        typeof value === 'string' && /^[a-zA-Z0-9_]{3,30}$/.test(value)
          ? true
          : 'Username must be 3–30 characters and contain only letters, numbers, and underscores.',
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'cover',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'bio',
      type: 'textarea',
      maxLength: 300,
    },
    {
      name: 'website',
      type: 'text',
    },
    {
      name: 'about',
      type: 'blocks',
      maxRows: 25,
      blocks: [
        {
          slug: 'section',
          fields: [
            { name: 'heading', type: 'text', maxLength: 120 },
            { name: 'body', type: 'textarea', maxLength: 5000 },
          ],
        },
        {
          slug: 'list',
          fields: [
            { name: 'heading', type: 'text', maxLength: 120 },
            {
              name: 'items',
              type: 'array',
              maxRows: 30,
              fields: [
                { name: 'value', type: 'text', label: 'Title', required: true, maxLength: 200 },
                { name: 'description', type: 'text', maxLength: 300 },
              ],
            },
          ],
        },
        {
          slug: 'links',
          fields: [
            { name: 'heading', type: 'text', maxLength: 120 },
            {
              name: 'items',
              type: 'array',
              maxRows: 20,
              fields: [
                { name: 'label', type: 'text', required: true, maxLength: 80 },
                { name: 'url', type: 'text', required: true, maxLength: 500 },
              ],
            },
          ],
        },
        {
          slug: 'image',
          fields: [
            { name: 'image', type: 'upload', relationTo: 'media', required: true },
            { name: 'caption', type: 'text', maxLength: 300 },
          ],
        },
        {
          slug: 'embed',
          fields: [
            { name: 'url', type: 'text', required: true, maxLength: 500 },
            { name: 'caption', type: 'text', maxLength: 300 },
          ],
        },
      ],
    },
    {
      name: 'isPrivate',
      type: 'checkbox',
      defaultValue: false,
      // Filtered in public-post queries and profile lookups.
      index: true,
    },
    {
      name: 'discoverable',
      type: 'checkbox',
      defaultValue: true,
      // Filtered in Explore search and suggested-people queries.
      index: true,
    },
    {
      name: 'publicProfile',
      type: 'checkbox',
      defaultValue: false,
      // Filtered in public /@handle profile lookups.
      index: true,
    },
    {
      name: 'commentPermission',
      type: 'select',
      options: [
        { label: 'Everyone', value: 'everyone' },
        { label: 'Followers only', value: 'followers' },
        { label: 'Off', value: 'off' },
      ],
      defaultValue: 'everyone',
    },
    {
      name: 'theme',
      type: 'select',
      options: [
        { label: 'System', value: 'system' },
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
      ],
      defaultValue: 'light',
    },
    {
      name: 'onboardedAt',
      type: 'date',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Set when the user finishes the onboarding flow.',
      },
    },
    {
      name: 'role',
      type: 'select',
      options: ['user', 'admin'],
      defaultValue: 'user',
      required: true,
      saveToJWT: true,
      access: {
        create: isAdminField,
        update: isAdminField,
      },
    },
  ],
}

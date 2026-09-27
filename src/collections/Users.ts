import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminField, isAdminUser, isAuthenticated, isSelfOrAdmin } from '../access'
import { sendWelcomeEmail } from '../hooks/sendWelcomeEmail'
import { deleteUserData } from '../lib/account'
import { escapeHtml, resolveEmailBaseUrl } from '../lib/email'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'username',
  },
  auth: {
    // 30 days — the login "Remember me" checkbox only controls whether the
    // cookie persists across browser restarts; the JWT lifetime is this either
    // way.
    tokenExpiration: 60 * 60 * 24 * 30,
    // Brute-force protection — lock the account for 10 minutes after 5
    // consecutive failed logins.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
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
  endpoints: [
    // Self-service account deletion for API clients (iOS app) — the web app
    // uses the deleteAccount server action, which shares the same cascade.
    // Identity is confirmed by the authenticated session + typed username.
    {
      path: '/delete-account',
      method: 'post',
      handler: async (req) => {
        const user = req.user
        if (!user) return Response.json({ message: 'Unauthorized' }, { status: 401 })

        let confirmation = ''
        try {
          const body = (await req.json?.()) as { confirmation?: unknown } | undefined
          if (typeof body?.confirmation === 'string') confirmation = body.confirmation
        } catch {
          // No/invalid JSON body — the confirmation check below rejects it.
        }

        if (confirmation.trim() !== user.username) {
          return Response.json(
            { message: 'The username you entered does not match.' },
            { status: 400 },
          )
        }

        const userId = user.id
        try {
          await deleteUserData(req.payload, userId)
        } catch (err) {
          req.payload.logger.error({ err, msg: 'Account deletion failed', userId })
          return Response.json(
            { message: 'Could not delete your account. Please try again.' },
            { status: 500 },
          )
        }

        return Response.json({ success: true })
      },
    },
  ],
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
      name: 'profileLayout',
      type: 'select',
      options: [
        { label: 'Classic', value: 'classic' },
        { label: 'Hero', value: 'hero' },
        { label: 'Minimal', value: 'minimal' },
      ],
      defaultValue: 'classic',
      admin: {
        description: 'Layout preset for the public /@username page.',
      },
    },
    {
      name: 'profileAccent',
      type: 'select',
      options: [
        { label: 'Charcoal', value: 'default' },
        { label: 'Ocean', value: 'ocean' },
        { label: 'Emerald', value: 'emerald' },
        { label: 'Sunset', value: 'sunset' },
        { label: 'Berry', value: 'berry' },
        { label: 'Gold', value: 'gold' },
      ],
      defaultValue: 'default',
      admin: {
        description: 'Accent color palette for the public /@username page.',
      },
    },
    {
      name: 'profileBackground',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Full-page backdrop image for the public /@username page.',
      },
    },
    {
      name: 'profileCardStyle',
      type: 'select',
      options: [
        { label: 'Glass (frosted)', value: 'glass' },
        { label: 'Solid', value: 'solid' },
      ],
      defaultValue: 'glass',
      admin: {
        description: 'Card surface style for the public /@username page.',
      },
    },
    {
      name: 'profileTheme',
      type: 'select',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
      ],
      defaultValue: 'light',
      admin: {
        description: 'Light or dark theme for the public /@username page.',
      },
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
        {
          slug: 'details',
          fields: [
            { name: 'heading', type: 'text', maxLength: 120 },
            {
              name: 'items',
              type: 'array',
              maxRows: 20,
              fields: [
                { name: 'label', type: 'text', required: true, maxLength: 60 },
                { name: 'value', type: 'text', required: true, maxLength: 160 },
              ],
            },
          ],
        },
        {
          slug: 'quote',
          fields: [
            { name: 'text', type: 'textarea', required: true, maxLength: 500 },
            { name: 'attribution', type: 'text', maxLength: 120 },
          ],
        },
        {
          slug: 'stats',
          fields: [
            { name: 'heading', type: 'text', maxLength: 120 },
            {
              name: 'items',
              type: 'array',
              maxRows: 8,
              fields: [
                { name: 'value', type: 'text', required: true, maxLength: 40 },
                { name: 'label', type: 'text', required: true, maxLength: 80 },
              ],
            },
          ],
        },
        {
          slug: 'gallery',
          fields: [
            { name: 'heading', type: 'text', maxLength: 120 },
            {
              name: 'items',
              type: 'array',
              maxRows: 12,
              fields: [
                { name: 'image', type: 'upload', relationTo: 'media', required: true },
                { name: 'caption', type: 'text', maxLength: 120 },
              ],
            },
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
      name: 'testimonialPermission',
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

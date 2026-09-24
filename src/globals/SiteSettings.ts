import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access'

// Site-wide settings editable by admins: brand identity, SEO defaults, and
// the copy shown on the public landing/auth pages.
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site Settings',
  access: {
    // Read publicly — the login, register, and public profile pages need it.
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Branding',
          fields: [
            {
              name: 'appName',
              type: 'text',
              required: true,
              defaultValue: 'Kitakits',
            },
            {
              name: 'logo',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: 'Optional image logo. Falls back to a letter tile using the app name.',
              },
            },
          ],
        },
        {
          label: 'SEO',
          fields: [
            {
              name: 'metaTitle',
              type: 'text',
              defaultValue: 'Kitakits',
              admin: {
                description: 'Default browser title. Page titles render as "Page — App name".',
              },
            },
            {
              name: 'metaDescription',
              type: 'textarea',
              defaultValue: 'Kitakits — a minimal social network.',
            },
            {
              name: 'ogImage',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: 'Default image for social link previews.',
              },
            },
          ],
        },
        {
          label: 'Landing Page',
          fields: [
            {
              name: 'heroHeading',
              type: 'text',
              admin: {
                description: 'Heading on the login and register pages. Defaults to the app name.',
              },
            },
            {
              name: 'heroTagline',
              type: 'text',
              defaultValue: 'a minimal social network.',
            },
            {
              name: 'loginPrompt',
              type: 'text',
              defaultValue: 'Log in to your account',
            },
            {
              name: 'registerPrompt',
              type: 'text',
              defaultValue: 'Create your account',
            },
          ],
        },
      ],
    },
  ],
}

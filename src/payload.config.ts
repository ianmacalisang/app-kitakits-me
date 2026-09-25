import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { uploadthingStorage } from '@payloadcms/storage-uploadthing'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Follows } from './collections/Follows'
import { Likes } from './collections/Likes'
import { Saves } from './collections/Saves'
import { Comments } from './collections/Comments'
import { Notifications } from './collections/Notifications'
import { Threads } from './collections/Threads'
import { Messages } from './collections/Messages'
import { MailDrafts } from './collections/MailDrafts'
import { MailAttachments } from './collections/MailAttachments'
import { Videos } from './collections/Videos'
import { SiteSettings } from './globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export default buildConfig({
  serverURL,
  // Cookie auth is rejected when a request's Origin isn't in this list.
  // Include localhost so local dev works even when NEXT_PUBLIC_APP_URL
  // points at the production domain.
  csrf: [serverURL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    Posts,
    Follows,
    Likes,
    Saves,
    Comments,
    Notifications,
    Threads,
    Messages,
    MailDrafts,
    MailAttachments,
    Videos,
  ],
  globals: [SiteSettings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
      // Keep enough connections open to handle concurrent requests without
      // waiting, but don't over-allocate on shared database hosts.
      min: 2,
      max: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
      // Release idle connections quickly to avoid holding slots unnecessarily.
      idleTimeoutMillis: 30_000,
      // Fail fast if the pool is exhausted rather than queuing indefinitely.
      connectionTimeoutMillis: 5_000,
    },
  }),
  email: resendAdapter({
    defaultFromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@kitakits.ph',
    defaultFromName: process.env.EMAIL_FROM_NAME || 'Kitakits',
    apiKey: process.env.RESEND_API_KEY || '',
  }),
  sharp,
  plugins: [
    uploadthingStorage({
      collections: {
        // media.read is already open — serve utfs.io URLs directly instead
        // of proxying every file through /api/media/file.
        media: { disablePayloadAccessControl: true },
        // Mail attachments keep Payload access control: files stay on
        // UploadThing but are served through /api/mail-attachments/file/...,
        // which enforces the collection's participant-scoped read access.
        'mail-attachments': true,
      },
      options: {
        token: process.env.UPLOADTHING_TOKEN,
        acl: 'public-read',
      },
    }),
  ],
})

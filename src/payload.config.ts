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
import { Testimonials } from './collections/Testimonials'
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
    Testimonials,
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
      // Shows up in pg_stat_activity so connections can be attributed per app.
      application_name: process.env.DB_APP_NAME || 'kitakits-app',
      // Serverless (Vercel): each isolate gets its own pool, and frozen
      // isolates can't run timers — never hold idle connections open.
      min: 0,
      max: parseInt(process.env.DB_POOL_MAX ?? '5', 10),
      allowExitOnIdle: true,
      idleTimeoutMillis: 10_000,
      // Fail fast if the pool is exhausted rather than queuing indefinitely.
      connectionTimeoutMillis: 5_000,
      // Detect sockets killed by the server/NAT instead of trusting them on
      // checkout — the default is no TCP keepalive at all.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      // Recycle clients so DB restarts or pooler changes don't strand sockets.
      maxUses: 1000,
      maxLifetimeSeconds: 300,
      // Fail stuck work instead of pinning a pool slot forever. Keep this
      // generous — it also applies to `payload migrate`.
      query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS ?? '30000', 10),
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? '30000', 10),
      idle_in_transaction_session_timeout: 10_000,
    },
  }),
  onInit: (payload) => {
    // pg.Pool emits 'error' when a server-killed idle client surfaces; without
    // a listener the unhandled event crashes the isolate. The pool evicts the
    // dead client itself — we just need to swallow and log.
    const pool = (
      payload.db as unknown as {
        pool?: { on: (event: 'error', cb: (err: Error) => void) => void }
      }
    ).pool
    pool?.on('error', (err) => payload.logger.error({ err, msg: 'Idle Postgres client error' }))
  },
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
        // Relative URL so links always hit the same origin the user is on —
        // an absolute serverURL would send the session cookie to the wrong
        // host whenever NEXT_PUBLIC_APP_URL doesn't match the browsed host.
        'mail-attachments': {
          generateFileURL: ({ filename }) =>
            `/api/mail-attachments/file/${encodeURIComponent(filename)}`,
        },
      },
      options: {
        token: process.env.UPLOADTHING_TOKEN,
        acl: 'public-read',
      },
    }),
  ],
})

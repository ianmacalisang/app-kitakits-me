// Shared constraints for mail attachments — used by the upload collection,
// the server actions, and the client composer. Kept out of the 'use server'
// action file so client components can import them.
export const MAIL_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const

export const MAIL_ATTACHMENT_ACCEPT = MAIL_ATTACHMENT_MIME_TYPES.join(',')

export const MAIL_ATTACHMENT_MAX_FILES = 4

// Per-file cap. The combined payload also has to fit inside Next's
// serverActions bodySizeLimit (10mb in next.config.ts), so the total cap
// stays below that with room for the rest of the form.
export const MAIL_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const MAIL_ATTACHMENT_MAX_TOTAL_BYTES = 9 * 1024 * 1024

export const isMailAttachmentType = (mime: string): boolean =>
  (MAIL_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime)

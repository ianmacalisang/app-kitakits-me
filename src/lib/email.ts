import type { PayloadRequest } from 'payload'

export const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

// Base URL for links embedded in transactional emails. Server actions pass the
// real request origin through req.context.baseUrl; config.serverURL
// (NEXT_PUBLIC_APP_URL) is the fallback for contexts without a request.
export const resolveEmailBaseUrl = (req?: PayloadRequest): string =>
  (typeof req?.context.baseUrl === 'string' && req.context.baseUrl) ||
  req?.payload.config.serverURL ||
  ''

import type { CollectionAfterChangeHook } from 'payload'

import { escapeHtml, resolveEmailBaseUrl } from '../lib/email'

export const sendWelcomeEmail: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return
  if (typeof doc?.email !== 'string' || !doc.email) return

  const brand = req.payload.email?.defaultFromName || 'Kitakits'
  const name = typeof doc.name === 'string' ? escapeHtml(doc.name) : ''
  const username = typeof doc.username === 'string' ? escapeHtml(doc.username) : ''
  const baseURL = resolveEmailBaseUrl(req)

  const loginSection = baseURL
    ? `<p style="margin:0 0 16px">
              <a href="${baseURL}/login" style="display:inline-block;background:#047857;color:#ffffff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600">
                Log in to ${escapeHtml(brand)}
              </a>
            </p>`
    : ''

  try {
    await req.payload.sendEmail({
      to: doc.email,
      subject: `Welcome to ${brand}`,
      html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#262626">
            <h2 style="margin:0 0 16px;font-size:20px">Welcome to ${escapeHtml(brand)}!</h2>
            <p style="margin:0 0 16px;line-height:1.5">
              Hi${name ? ` ${name}` : ''}, your account is ready${
                username ? ` — your handle is <strong>@${username}</strong>` : ''
              }. Set up your profile and start connecting with the community.
            </p>
            ${loginSection}
            <p style="margin:0;font-size:14px;line-height:1.5;color:#525252">
              Welcome aboard — the ${escapeHtml(brand)} team
            </p>
          </div>
        `,
    })
  } catch (err) {
    // Email delivery must never block or fail a registration.
    req.payload.logger.error({ err, msg: 'Failed to send welcome email' })
  }
}

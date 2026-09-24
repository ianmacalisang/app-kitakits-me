import sanitizeHtml from 'sanitize-html'

// Server-side allowlist for mail bodies — keeps the formatting the composer
// emits (TipTap marks/blocks) and strips everything else, including scripts,
// event handlers, and non-http(s) URLs.
export function sanitizeMailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'del',
      'strike',
      'h1',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'code',
      'pre',
      'hr',
      'a',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  })
}

// Plain-text equivalent for empty checks and snippets.
export function mailHtmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

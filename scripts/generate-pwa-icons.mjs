// Generates placeholder PWA icons (gradient letter tile matching BrandMark).
// Replace the outputs in public/icons/ and src/app/apple-icon.png with real
// artwork when available — or re-run: node scripts/generate-pwa-icons.mjs [letter]
import sharp from 'sharp'

const letter = (process.argv[2] || 'K').charAt(0).toUpperCase()

const tile = (size, { rx = '22%', fontScale = 0.5 } = {}) => {
  const fontSize = Math.round(size * fontScale)
  const radius = typeof rx === 'string' ? Math.round((parseFloat(rx) / 100) * size) : rx
  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#404040"/>
          <stop offset="0.5" stop-color="#2b2b2b"/>
          <stop offset="1" stop-color="#1a1a1a"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
      <text x="50%" y="50%" dy="0.36em" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="${fontSize}" fill="#ffffff">${letter}</text>
    </svg>`)
}

const jobs = [
  ['public/icons/icon-192.png', tile(192)],
  ['public/icons/icon-512.png', tile(512)],
  // Maskable: full-bleed square, glyph shrunk into the 80% safe zone.
  ['public/icons/icon-maskable-512.png', tile(512, { rx: 0, fontScale: 0.35 })],
  // apple-touch-icon: iOS applies its own rounding; needs an opaque full-bleed square.
  ['src/app/apple-icon.png', tile(180, { rx: 0, fontScale: 0.5 })],
]

for (const [path, svg] of jobs) {
  await sharp(svg).png().toFile(path)
  console.log(`wrote ${path}`)
}

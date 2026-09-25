// Client-side image optimization — downscale + re-encode to WebP before upload.
// Keeps animated GIFs and SVGs as-is; falls back to the original file if the
// browser can't decode it or the re-encode isn't smaller.

const SKIP_TYPES = new Set(['image/gif', 'image/svg+xml'])

const TARGET_BYTES = 300 * 1024
const MAX_ATTEMPTS = 8
const MIN_DIMENSION = 240

export async function compressImage(
  file: File,
  {
    maxSize = 1920,
    targetBytes = TARGET_BYTES,
    quality = 0.82,
  }: { maxSize?: number; targetBytes?: number; quality?: number } = {},
): Promise<File> {
  if (SKIP_TYPES.has(file.type) || (file.type !== '' && !file.type.startsWith('image/'))) {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)

    // Small enough in both dimensions and bytes — keep the original.
    if (Math.max(bitmap.width, bitmap.height) <= maxSize && file.size <= targetBytes) {
      bitmap.close()
      return file
    }

    const encode = (width: number, height: number, q: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width))
      canvas.height = Math.max(1, Math.round(height))
      const ctx = canvas.getContext('2d')
      if (!ctx) return Promise.resolve(null)
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', q))
    }

    const initialScale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    let width = bitmap.width * initialScale
    let height = bitmap.height * initialScale
    let q = quality
    let best: Blob | null = null

    // Iteratively lower quality, then shrink dimensions, until under targetBytes.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const blob = await encode(width, height, q)
      if (blob && (!best || blob.size < best.size)) best = blob
      if (!blob || blob.size <= targetBytes) break

      if (q > 0.5) {
        q -= 0.15
      } else {
        width *= 0.7
        height *= 0.7
        q = 0.6
        if (Math.min(width, height) < MIN_DIMENSION) break
      }
    }
    bitmap.close()

    if (!best || best.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([best], `${name}.webp`, { type: 'image/webp' })
  } catch {
    return file
  }
}

// Client-side image optimization — downscale + re-encode to WebP before upload.
// Keeps animated GIFs and SVGs as-is; falls back to the original file if the
// browser can't decode it or the re-encode isn't smaller.

const SKIP_TYPES = new Set(['image/gif', 'image/svg+xml'])

export async function compressImage(
  file: File,
  { maxSize = 1920, quality = 0.82 }: { maxSize?: number; quality?: number } = {},
): Promise<File> {
  if (SKIP_TYPES.has(file.type) || (file.type !== '' && !file.type.startsWith('image/'))) {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))

    // Small enough in both dimensions and bytes — keep the original.
    if (scale >= 1 && file.size <= 400 * 1024) {
      bitmap.close()
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    )
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${name}.webp`, { type: 'image/webp' })
  } catch {
    return file
  }
}

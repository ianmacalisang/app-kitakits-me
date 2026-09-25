import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { updatePost } from '@/actions/posts'
import { toCdnUrl } from '@/lib/cdn'
import { compressImage } from '@/lib/image'

import { BlurImage } from './BlurImage'
import { ImageIcon, XIcon } from './icons'

const MAX_IMAGES = 4

export function PostEditForm({
  postId,
  initialContent,
  initialVisibility = 'public',
  images: initialImages,
  onDoneAction,
}: {
  postId: number
  initialContent: string
  initialVisibility?: 'public' | 'followers'
  images: { id: number; url: string }[]
  onDoneAction: () => void
}) {
  const router = useRouter()
  const [content, setContent] = useState(initialContent)
  const [visibility, setVisibility] = useState<'public' | 'followers'>(initialVisibility)
  const [keptIds, setKeptIds] = useState<number[]>(initialImages.map((i) => i.id))
  const [newImages, setNewImages] = useState<{ file: File; url: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const total = keptIds.length + newImages.length

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const slots = MAX_IMAGES - keptIds.length - newImages.length
    const picked = Array.from(files)
      .filter((f) => !f.type || f.type.startsWith('image/'))
      .slice(0, Math.max(0, slots))
    if (picked.length === 0) return
    void Promise.all(picked.map((file) => compressImage(file))).then((compressed) =>
      setNewImages((prev) => [
        ...prev,
        ...compressed.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ]),
    )
  }

  const removeNew = (index: number) => {
    const item = newImages[index]
    if (!item) return
    URL.revokeObjectURL(item.url)
    setNewImages(newImages.filter((_, i) => i !== index))
  }

  const save = () => {
    const formData = new FormData()
    formData.set('content', content)
    formData.set('visibility', visibility)
    for (const id of keptIds) formData.append('keepImage', String(id))
    for (const item of newImages) formData.append('image', item.file)

    startTransition(async () => {
      let result
      try {
        result = await updatePost(postId, formData)
      } catch {
        result = { error: 'Upload failed. Try smaller images.' }
      }
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
        onDoneAction()
      }
    })
  }

  const kept = initialImages.filter((i) => keptIds.includes(i.id))

  return (
    <div className="mt-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        maxLength={2000}
        autoFocus
        placeholder="What's on your mind?"
        className="w-full resize-none rounded-2xl border border-neutral-200/60 bg-white/60 p-3 text-[15px] leading-relaxed outline-none backdrop-blur-sm transition-all focus:border-emerald-400 focus:bg-white/80 focus:ring-4 focus:ring-emerald-500/10"
      />

      {/* Existing + newly picked images */}
      {total > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {kept.map((image) => (
            <div key={`keep-${image.id}`} className="relative h-24 w-24">
              <BlurImage
                src={toCdnUrl(image.url)}
                alt=""
                className="h-full w-full rounded-xl border border-black/5 object-cover"
              />
              <button
                type="button"
                onClick={() => setKeptIds((prev) => prev.filter((id) => id !== image.id))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-900/80 p-1 text-white backdrop-blur"
                aria-label="Remove image"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {newImages.map((item, i) => (
            <div key={item.url} className="relative h-24 w-24">
              <BlurImage
                src={item.url}
                alt="New image"
                className="h-full w-full rounded-xl border border-black/5 object-cover"
              />
              <button
                type="button"
                onClick={() => removeNew(i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-900/80 p-1 text-white backdrop-blur"
                aria-label="Remove new image"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: image picker + audience */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <label
          className={`btn-accent-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            total >= MAX_IMAGES ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
          }`}
          title={total >= MAX_IMAGES ? 'Max 4 images' : 'Add images'}
        >
          <ImageIcon className="h-4.5 w-4.5" />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            disabled={total >= MAX_IMAGES}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        <div className="flex rounded-full bg-black/5 p-0.5 text-xs font-medium">
          {(
            [
              { value: 'public', label: 'Everyone' },
              { value: 'followers', label: 'Followers' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setVisibility(value)}
              className={`rounded-full px-3 py-1.5 transition-all ${
                visibility === value
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="btn-primary rounded-full px-4 py-1.5 text-sm"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onDoneAction}
          className="rounded-full border border-white/60 bg-white/60 px-4 py-1.5 text-sm font-medium text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-white/80"
        >
          Cancel
        </button>
        <span className="ml-auto text-xs text-neutral-400">{content.length}/2000</span>
      </div>
    </div>
  )
}

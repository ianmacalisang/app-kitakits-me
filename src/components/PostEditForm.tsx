import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Upload } from 'tus-js-client'

import { getPost, updatePost } from '@/actions/posts'
import { createVideoUpload, discardVideo, markVideoUploaded } from '@/actions/videos'
import type { PostCategory } from '@/lib/categories'
import { toCdnUrl } from '@/lib/cdn'
import { emitPostUpdated } from '@/lib/events'
import { compressImage } from '@/lib/image'
import type { PostVideoData } from '@/lib/serialize'

import { BlurImage } from './BlurImage'
import { CategoryPicker } from './CategoryPicker'
import { ImageIcon, VideoIcon, XIcon } from './icons'
import { Spinner } from './Spinner'

const MAX_IMAGES = 4
const MAX_VIDEO_BYTES = 256 * 1024 * 1024

interface PickedVideo {
  previewUrl: string
  progress: number
  videoId: number | null
  uploading: boolean
}

export function PostEditForm({
  postId,
  initialContent,
  initialVisibility = 'public',
  initialCategory = null,
  images: initialImages,
  video: initialVideo,
  onDoneAction,
}: {
  postId: number
  initialContent: string
  initialVisibility?: 'public' | 'followers'
  initialCategory?: PostCategory | null
  images: { id: number; url: string }[]
  video?: PostVideoData
  onDoneAction: () => void
}) {
  const router = useRouter()
  const [content, setContent] = useState(initialContent)
  const [visibility, setVisibility] = useState<'public' | 'followers'>(initialVisibility)
  const [category, setCategory] = useState<PostCategory | null>(initialCategory)
  const [keptIds, setKeptIds] = useState<number[]>(initialImages.map((i) => i.id))
  const [keepVideo, setKeepVideo] = useState(true)
  const [video, setVideo] = useState<PickedVideo | null>(null)
  const [newImages, setNewImages] = useState<{ file: File; url: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<Upload | null>(null)
  // Mirror of `video` for the unmount cleanup + whether a picked video was
  // actually saved onto the post (otherwise its doc would be orphaned).
  const pickedRef = useRef<PickedVideo | null>(null)
  const savedRef = useRef(false)

  const total = keptIds.length + newImages.length
  const hasVideo = video !== null || (initialVideo != null && keepVideo)

  useEffect(() => {
    pickedRef.current = video
  }, [video])

  // Leaving the editor mid-upload or with an unsaved pick aborts TUS and
  // discards the video doc; a saved video must NOT be discarded here.
  useEffect(
    () => () => {
      const upload = uploadRef.current
      uploadRef.current = null
      if (upload) void upload.abort()
      const picked = pickedRef.current
      if (!picked) return
      URL.revokeObjectURL(picked.previewUrl)
      if (picked.videoId && !savedRef.current) void discardVideo(picked.videoId)
    },
    [],
  )

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const slots = MAX_IMAGES - keptIds.length - newImages.length
    const picked = Array.from(files)
      .filter((f) => !f.type || f.type.startsWith('image/'))
      .slice(0, Math.max(0, slots))
    if (picked.length === 0) return
    // Posts hold images OR one video — mirror the composer's exclusivity.
    removeVideo()
    setKeepVideo(false)
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

  // Same direct-to-Bunny TUS flow as the composer — the file never passes
  // through the app server.
  const startVideoUpload = async (file: File) => {
    const creds = await createVideoUpload({ filename: file.name, size: file.size })
    if ('error' in creds || !creds.videoId) {
      setVideo(null)
      setError('error' in creds ? creds.error : 'Video upload failed.')
      return
    }
    setVideo({
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      videoId: creds.videoId,
      uploading: true,
    })

    const upload = new Upload(file, {
      endpoint: creds.endpoint,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        AuthorizationSignature: creds.signature,
        AuthorizationExpire: String(creds.expires),
        VideoId: creds.guid,
        LibraryId: creds.libraryId,
      },
      metadata: { filename: file.name, filetype: file.type },
      onProgress: (uploaded, total) =>
        setVideo((v) => (v ? { ...v, progress: Math.floor((uploaded / total) * 100) } : v)),
      onSuccess: () => {
        setVideo((v) => (v ? { ...v, uploading: false, progress: 100 } : v))
        void markVideoUploaded(creds.videoId)
        uploadRef.current = null
      },
      onError: () => {
        uploadRef.current = null
        setVideo((v) => {
          if (v) URL.revokeObjectURL(v.previewUrl)
          return null
        })
        void discardVideo(creds.videoId)
        setError('Video upload failed. Try again.')
      },
    })
    uploadRef.current = upload
    upload.start()
  }

  const pickVideo = (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!file.type.startsWith('video/')) {
      setError('Choose a video file.')
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError('Video must be under 256MB.')
      return
    }
    removeVideo()
    setKeepVideo(false)
    setKeptIds([])
    setNewImages((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.url)
      return []
    })
    void startVideoUpload(file)
  }

  const removeVideo = () => {
    const pendingUpload = uploadRef.current
    uploadRef.current = null
    if (pendingUpload) void pendingUpload.abort()
    setVideo((v) => {
      if (!v) return v
      URL.revokeObjectURL(v.previewUrl)
      if (v.videoId) void discardVideo(v.videoId)
      return null
    })
  }

  const cancel = () => {
    removeVideo()
    onDoneAction()
  }

  const save = () => {
    const formData = new FormData()
    formData.set('content', content)
    formData.set('visibility', visibility)
    formData.set('category', category ?? '')
    for (const id of keptIds) formData.append('keepImage', String(id))
    for (const item of newImages) formData.append('image', item.file)
    const videoId = video?.videoId ?? (initialVideo && keepVideo ? initialVideo.id : null)
    if (videoId !== null) formData.set('video', String(videoId))

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
        // The picked video now belongs to the post — the unmount cleanup
        // must not discard it.
        if (video?.videoId) savedRef.current = true
        setVideo((v) => {
          if (v) URL.revokeObjectURL(v.previewUrl)
          return null
        })
        // Patch every mounted card in place — posts past the first page are
        // outside the router.refresh() reconcile window.
        void getPost(postId).then((post) => {
          if (post) emitPostUpdated(post)
        })
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
        className="w-full resize-none rounded-2xl border border-neutral-200/60 bg-white/60 p-3 text-[15px] leading-relaxed outline-none backdrop-blur-sm transition-all focus:border-accent-400 focus:bg-white/80 focus:ring-4 focus:ring-accent-500/10"
      />

      <div className="mt-3">
        <CategoryPicker value={category} onChange={setCategory} />
      </div>

      {/* Attached video — kept unless removed */}
      {initialVideo && keepVideo && (
        <div className="relative mt-2 aspect-video w-48 overflow-hidden rounded-xl border border-black/5 bg-neutral-950">
          {initialVideo.thumbnailUrl ? (
            <BlurImage
              src={initialVideo.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
              Video
            </div>
          )}
          {initialVideo.status === 'processing' && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
              Processing…
            </span>
          )}
          <button
            type="button"
            onClick={() => setKeepVideo(false)}
            className="absolute right-1.5 top-1.5 rounded-full bg-neutral-900/80 p-1 text-white backdrop-blur"
            aria-label="Remove video"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Newly picked video — live preview + upload progress (same as composer) */}
      {video && (
        <div className="relative mt-2 aspect-video overflow-hidden rounded-2xl border border-black/5 bg-neutral-950">
          <video
            src={video.previewUrl}
            muted
            playsInline
            className="h-full w-full object-contain"
          />
          {video.uploading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 text-white">
              <Spinner className="h-5 w-5" />
              <span className="text-xs font-medium">Uploading video… {video.progress}%</span>
            </div>
          )}
          <button
            type="button"
            onClick={removeVideo}
            className="absolute right-1.5 top-1.5 rounded-full bg-neutral-900/80 p-1 text-white backdrop-blur"
            aria-label="Remove video"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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

      {/* Toolbar: image + video pickers, audience */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label
            className={`btn-accent-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              total >= MAX_IMAGES || hasVideo ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
            }`}
            title={total >= MAX_IMAGES ? 'Max 4 images' : 'Add images'}
          >
            <ImageIcon className="h-4.5 w-4.5" />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              disabled={total >= MAX_IMAGES || hasVideo}
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          <label
            className={`btn-accent-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              total > 0 || hasVideo ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
            }`}
            title="Add video (max 256MB)"
          >
            <VideoIcon className="h-4.5 w-4.5" />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              disabled={total > 0 || hasVideo}
              className="hidden"
              onChange={(e) => {
                pickVideo(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>

        <div className="flex rounded-full bg-black/5 p-0.5 text-xs font-medium dark:bg-white/10">
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
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100 dark:shadow-none'
                  : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
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
          disabled={pending || Boolean(video?.uploading)}
          className="btn-primary rounded-full px-4 py-1.5 text-sm"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={cancel}
          className="rounded-full border border-white/60 bg-white/60 px-4 py-1.5 text-sm font-medium text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-white/80"
        >
          Cancel
        </button>
        <span className="ml-auto text-xs text-neutral-400">{content.length}/2000</span>
      </div>
    </div>
  )
}

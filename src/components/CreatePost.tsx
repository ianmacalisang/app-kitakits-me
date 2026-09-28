'use client'

import { useRouter } from 'next/navigation'
import { memo, useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Upload } from 'tus-js-client'

import { createPost } from '@/actions/posts'
import { createVideoUpload, discardVideo, markVideoUploaded } from '@/actions/videos'
import { CATEGORY_TINTS, type PostCategory, postCategory } from '@/lib/categories'
import { toast } from '@/lib/events'
import { compressImage } from '@/lib/image'

import { Avatar } from './Avatar'
import { CategoryPicker } from './CategoryPicker'
import { BlurImage } from './BlurImage'
import { ChevronDownIcon, EyeIcon, ImageIcon, PlusIcon, UserIcon, VideoIcon, XIcon } from './icons'
import { Spinner } from './Spinner'
import { useSheetDragClose } from './useSheetDrag'

const CLOSE_MS = 300
const MAX_IMAGES = 4
const MAX_CHARS = 2000
const MAX_VIDEO_BYTES = 256 * 1024 * 1024

interface PickedVideo {
  previewUrl: string
  progress: number
  videoId: number | null
  uploading: boolean
}

const AUDIENCE = [
  { value: 'public', label: 'Everyone', Icon: EyeIcon },
  { value: 'followers', label: 'Followers', Icon: UserIcon },
] as const

export const CreatePost = memo(function CreatePost({
  avatarUrl,
  name,
}: {
  avatarUrl?: string
  name: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [images, setImages] = useState<{ file: File; url: string }[]>([])
  const [video, setVideo] = useState<PickedVideo | null>(null)
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public')
  const [category, setCategory] = useState<PostCategory | null>('kwento')
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<Upload | null>(null)
  const audienceRef = useRef<HTMLDivElement>(null)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const slots = MAX_IMAGES - images.length
    const picked = Array.from(files)
      .filter((f) => !f.type || f.type.startsWith('image/'))
      .slice(0, Math.max(0, slots))
    if (picked.length === 0) return
    removeVideo()
    void Promise.all(picked.map((file) => compressImage(file))).then((compressed) =>
      setImages((prev) => [
        ...prev,
        ...compressed.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ]),
    )
  }

  const removeImage = (index: number) => {
    const item = images[index]
    if (!item) return
    URL.revokeObjectURL(item.url)
    setImages(images.filter((_, i) => i !== index))
  }

  const clearImages = () => {
    for (const item of images) URL.revokeObjectURL(item.url)
    setImages([])
  }

  // Videos upload straight to Bunny via TUS — the file never passes through
  // the app server, so large videos aren't limited by the request body cap.
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
    clearImages()
    void startVideoUpload(file)
  }

  const removeVideo = () => {
    const pending = uploadRef.current
    uploadRef.current = null
    if (pending) void pending.abort()
    setVideo((v) => {
      if (!v) return v
      URL.revokeObjectURL(v.previewUrl)
      if (v.videoId) void discardVideo(v.videoId)
      return null
    })
  }

  const categoryEntry = postCategory(category)

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, CLOSE_MS)
  }, [closing])

  const sheetDrag = useSheetDragClose(close)

  // Lock scroll and support Escape while the composer modal is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (audienceOpen) {
        setAudienceOpen(false)
        return
      }
      close()
    }
    const onClick = (e: MouseEvent) => {
      if (!audienceRef.current?.contains(e.target as Node)) setAudienceOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
      document.body.style.overflow = ''
    }
  }, [open, close, audienceOpen])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    for (const item of images) formData.append('image', item.file)
    startTransition(async () => {
      let result
      try {
        result = await createPost({}, formData)
      } catch {
        result = { error: 'Upload failed. Try smaller images.' }
      }
      if (result.error) {
        setError(result.error)
      } else {
        form.reset()
        clearImages()
        setVideo((v) => {
          if (v) URL.revokeObjectURL(v.previewUrl)
          return null
        })
        setContent('')
        setError(null)
        setVisibility('public')
        setCategory('kwento')
        toast('Posted!')
        router.refresh()
        close()
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Create post"
        title="Create"
        className="-my-6 relative flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full opacity-0 ring-2 ring-emerald-400/70 motion-safe:animate-mail-ring"
        />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/40 ring-4 ring-white/60">
          <PlusIcon className="h-7 w-7" />
        </span>
      </button>

      {/* Composer modal — sliding bottom sheet on mobile, dialog on desktop.
          Portaled to body so the glass dock's backdrop-filter can't trap it. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
            <div
              className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
                closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
              }`}
            />
            <div
              {...sheetDrag}
              className={`glass relative flex h-dvh w-full max-w-lg flex-col overflow-y-auto overscroll-none rounded-t-[28px] px-5 pb-5 pt-2 sm:h-auto sm:max-h-[85vh] sm:rounded-[28px] sm:pt-4 ${
                closing
                  ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
                  : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
              }`}
            >
              {/* iOS sheet drag handle (mobile) */}
              <div
                data-sheet-handle
                className="mx-auto mb-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
              />

              <form ref={formRef} onSubmit={handleSubmit}>
                {/* Header: Cancel / title / Post — iOS compose bar */}
                <div
                  data-sheet-handle
                  className="flex items-center justify-between border-b border-black/5 pb-3"
                >
                  <button
                    type="button"
                    onClick={close}
                    className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800"
                  >
                    Cancel
                  </button>
                  <h2 className="text-[15px] font-semibold">New Post</h2>
                  <button
                    type="submit"
                    disabled={
                      pending ||
                      Boolean(video?.uploading) ||
                      (!content.trim() && images.length === 0 && !video?.videoId)
                    }
                    className="btn-primary flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm"
                  >
                    {pending && <Spinner className="h-3.5 w-3.5" />}
                    {pending ? 'Posting…' : 'Post'}
                  </button>
                </div>

                <div className="flex gap-3 pt-4">
                  <Avatar src={avatarUrl} name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-tight">{name}</p>

                    {/* Audience picker */}
                    <div ref={audienceRef} className="relative mt-1 w-fit">
                      <button
                        type="button"
                        onClick={() => setAudienceOpen((v) => !v)}
                        className="flex items-center gap-1 rounded-full bg-accent-500/10 py-1 pl-2.5 pr-2 text-xs font-medium text-accent-700 transition-colors hover:bg-accent-500/20"
                      >
                        {visibility === 'public' ? (
                          <EyeIcon className="h-3.5 w-3.5" />
                        ) : (
                          <UserIcon className="h-3.5 w-3.5" />
                        )}
                        {visibility === 'public' ? 'Everyone' : 'Followers'}
                        <ChevronDownIcon className="h-3 w-3 opacity-60" />
                      </button>
                      {audienceOpen && (
                        <div className="glass absolute left-0 top-full z-20 mt-1.5 w-44 rounded-2xl p-1.5">
                          {AUDIENCE.map(({ value, label, Icon }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                setVisibility(value)
                                setAudienceOpen(false)
                              }}
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-white/70"
                            >
                              <Icon className="h-4 w-4 text-neutral-500" />
                              {label}
                              {visibility === value && (
                                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-500" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-2">
                      <CategoryPicker value={category} onChange={setCategory} />
                    </div>

                    <textarea
                      name="content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      maxLength={MAX_CHARS}
                      rows={3}
                      autoFocus
                      placeholder={(
                        categoryEntry?.prompt ?? "What's on your mind, {name}…"
                      ).replace('{name}', name.split(' ')[0])}
                      className={`field-sizing-content mt-1.5 min-h-[96px] w-full resize-none rounded-2xl border bg-white/95 px-3 py-2.5 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-neutral-400 ${
                        categoryEntry
                          ? CATEGORY_TINTS[categoryEntry.tint].card
                          : 'border-neutral-200/60'
                      }`}
                    />
                  </div>
                </div>

                {video && (
                  <div className="ml-[52px] mt-2">
                    <div className="relative aspect-video overflow-hidden rounded-2xl border border-black/5 bg-neutral-950">
                      <video
                        src={video.previewUrl}
                        muted
                        playsInline
                        className="h-full w-full object-contain"
                      />
                      {video.uploading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 text-white">
                          <Spinner className="h-5 w-5" />
                          <span className="text-xs font-medium">
                            Uploading video… {video.progress}%
                          </span>
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
                  </div>
                )}

                {images.length > 0 && (
                  <div className="ml-[52px] mt-2 flex flex-wrap gap-2">
                    {images.map((item, i) => (
                      <div key={item.url} className="relative h-24 w-24">
                        <BlurImage
                          src={item.url}
                          alt="Selected image"
                          className="h-full w-full rounded-xl border border-black/5 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-900/80 p-1 text-white backdrop-blur"
                          aria-label="Remove image"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {error && (
                  <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600">
                    {error}
                  </p>
                )}

                {/* Bottom toolbar */}
                <input type="hidden" name="visibility" value={visibility} />
                <input type="hidden" name="category" value={category ?? ''} />
                {video && !video.uploading && video.videoId !== null && (
                  <input type="hidden" name="video" value={video.videoId} />
                )}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/5 pt-3">
                  <div className="flex items-center gap-2">
                    <label
                      className={`btn-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        images.length >= MAX_IMAGES || video !== null
                          ? 'cursor-not-allowed opacity-40'
                          : 'cursor-pointer'
                      }`}
                      title={images.length >= MAX_IMAGES ? 'Max 4 images' : 'Add images'}
                    >
                      <ImageIcon className="h-5 w-5" />
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={images.length >= MAX_IMAGES || video !== null}
                        className="hidden"
                        onChange={(e) => {
                          addFiles(e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <label
                      className={`btn-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        images.length > 0 || video !== null
                          ? 'cursor-not-allowed opacity-40'
                          : 'cursor-pointer'
                      }`}
                      title="Add video (max 256MB)"
                    >
                      <VideoIcon className="h-5 w-5" />
                      <input
                        ref={videoRef}
                        type="file"
                        accept="video/*"
                        disabled={images.length > 0 || video !== null}
                        className="hidden"
                        onChange={(e) => {
                          pickVideo(e.target.files?.[0])
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>

                  <span
                    className={`text-xs tabular-nums ${
                      content.length >= MAX_CHARS ? 'text-amber-600' : 'text-neutral-400'
                    }`}
                  >
                    {content.length}/{MAX_CHARS}
                  </span>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
})

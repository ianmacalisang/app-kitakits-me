'use client'

import { useRouter } from 'next/navigation'
import { memo, useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Upload } from 'tus-js-client'

import { createPost } from '@/actions/posts'
import { updateDefaultPostVisibility } from '@/actions/users'
import { createVideoUpload, discardVideo, markVideoUploaded } from '@/actions/videos'
import { CATEGORY_TINTS, type PostCategory, postCategory } from '@/lib/categories'
import { toast } from '@/lib/events'
import { compressImage } from '@/lib/image'
import type { PostVisibility } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { CategoryPicker } from './CategoryPicker'
import { BlurImage } from './BlurImage'
import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  ImageIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from './icons'
import { Spinner } from './Spinner'
import { useSheetDragClose } from './useSheetDrag'

const CLOSE_MS = 300
const MAX_IMAGES = 4
const MAX_CHARS = 2000
const MAX_VIDEO_BYTES = 256 * 1024 * 1024
const RING_R = 9
const RING_C = 2 * Math.PI * RING_R

interface PickedVideo {
  previewUrl: string
  progress: number
  videoId: number | null
  uploading: boolean
}

const AUDIENCE = [
  {
    value: 'public',
    label: 'Everyone',
    Icon: EyeIcon,
    description: 'Anyone on or off Kitakits can see this post',
  },
  {
    value: 'followers',
    label: 'Followers',
    Icon: UserIcon,
    description: 'Only people who follow you',
  },
  {
    value: 'mutuals',
    label: 'Mutuals',
    Icon: UsersIcon,
    description: 'Only people you follow who follow you back',
  },
] as const

export const CreatePost = memo(function CreatePost({
  avatarUrl,
  name,
  defaultVisibility,
}: {
  avatarUrl?: string
  name: string
  defaultVisibility: PostVisibility
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [images, setImages] = useState<{ file: File; url: string }[]>([])
  const [video, setVideo] = useState<PickedVideo | null>(null)
  const [visibility, setVisibility] = useState<PostVisibility>(defaultVisibility)
  const [category, setCategory] = useState<PostCategory | null>('kwento')
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<Upload | null>(null)
  const audienceRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Saved on the user record so the choice follows the account across
  // browsers. Fire-and-forget — local state already reflects the pick.
  const chooseVisibility = (value: PostVisibility) => {
    setVisibility(value)
    void updateDefaultPostVisibility(value)
  }

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
  const audienceEntry = AUDIENCE.find((a) => a.value === visibility) ?? AUDIENCE[0]

  const remaining = MAX_CHARS - content.length
  const fill = Math.min(1, content.length / MAX_CHARS)
  const canPost =
    Boolean(content.trim()) || images.length > 0 || (video?.videoId != null && !video.uploading)

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

  // Keep the overlay inside the visual viewport. The software keyboard only
  // shrinks the visual viewport — the layout viewport (and dvh) stay put, so
  // without this the browser pans the page to reveal the focused textarea and
  // pushes the sheet's header off the top of the screen.
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    const overlay = overlayRef.current
    if (!vv || !overlay) return
    const sync = () => {
      overlay.style.top = `${vv.offsetTop}px`
      overlay.style.height = `${vv.height}px`
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [open])

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
          <div
            ref={overlayRef}
            className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4"
          >
            <div
              className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
                closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
              }`}
            />
            <div
              {...sheetDrag}
              className={`glass relative flex h-full w-full max-w-lg flex-col overflow-y-auto overscroll-none rounded-t-[28px] px-5 pb-5 pt-2 sm:h-auto sm:max-h-[85vh] sm:rounded-[28px] sm:pt-4 ${
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
                    disabled={pending || !canPost || Boolean(video?.uploading)}
                    className="btn-primary flex min-w-[76px] items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm"
                  >
                    {pending && <Spinner className="h-3.5 w-3.5" />}
                    {pending ? 'Posting…' : 'Post'}
                  </button>
                </div>

                {/* Identity row */}
                <div className="flex items-center gap-3 pt-4">
                  <Avatar src={avatarUrl} name={name} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold leading-tight">{name}</p>

                    {/* Audience picker */}
                    <div ref={audienceRef} className="relative mt-1 w-fit">
                      <button
                        type="button"
                        onClick={() => setAudienceOpen((v) => !v)}
                        className="flex items-center gap-1 rounded-full bg-accent-500/10 py-1 pl-2.5 pr-2 text-xs font-medium text-accent-700 transition-colors hover:bg-accent-500/20 active:scale-95"
                      >
                        <audienceEntry.Icon className="h-3.5 w-3.5" />
                        {audienceEntry.label}
                        <ChevronDownIcon className="h-3 w-3 opacity-60" />
                      </button>
                      {audienceOpen && (
                        <div className="glass-pop absolute left-0 top-full z-20 mt-1.5 w-60 rounded-2xl p-1.5 motion-safe:animate-menu-pop">
                          {AUDIENCE.map(({ value, label, Icon, description }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                chooseVisibility(value)
                                setAudienceOpen(false)
                              }}
                              className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/70"
                            >
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{label}</span>
                                <span className="block text-xs leading-snug text-neutral-500">
                                  {description}
                                </span>
                              </span>
                              {visibility === value && (
                                <CheckIcon className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Composer card — textarea and attachments share one tinted
                    surface so the whole thing reads as a single unit */}
                <div
                  className={`mt-3 rounded-3xl border bg-white/80 transition-shadow focus-within:ring-4 focus-within:ring-accent-500/10 ${
                    categoryEntry
                      ? CATEGORY_TINTS[categoryEntry.tint].card
                      : 'border-neutral-200/60'
                  }`}
                >
                  <textarea
                    name="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        (e.metaKey || e.ctrlKey) &&
                        e.key === 'Enter' &&
                        canPost &&
                        !video?.uploading
                      )
                        formRef.current?.requestSubmit()
                    }}
                    maxLength={MAX_CHARS}
                    rows={3}
                    autoFocus
                    placeholder={(categoryEntry?.prompt ?? "What's on your mind, {name}…").replace(
                      '{name}',
                      name.split(' ')[0],
                    )}
                    className="field-sizing-content min-h-[110px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-neutral-400"
                  />

                  {video && (
                    <div className="px-3 pb-3">
                      <div className="relative aspect-video overflow-hidden rounded-2xl border border-black/5 bg-neutral-950">
                        <video
                          src={video.previewUrl}
                          muted
                          playsInline
                          className="h-full w-full object-contain"
                        />
                        {video.uploading && (
                          <>
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 text-white">
                              <Spinner className="h-5 w-5" />
                              <span className="text-xs font-medium">
                                Uploading video… {video.progress}%
                              </span>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                              <div
                                className="h-full bg-white/90 transition-[width] duration-200"
                                style={{ width: `${video.progress}%` }}
                              />
                            </div>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={removeVideo}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-transform hover:scale-105 active:scale-95"
                          aria-label="Remove video"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {images.length > 0 && (
                    <div
                      className={`grid gap-2 px-3 pb-3 ${
                        images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                      }`}
                    >
                      {images.map((item, i) => (
                        <div
                          key={item.url}
                          className={`relative overflow-hidden rounded-2xl border border-black/5 ${
                            images.length === 1 ? 'aspect-[4/3] max-h-72' : 'aspect-square'
                          }`}
                        >
                          <BlurImage
                            src={item.url}
                            alt="Selected image"
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-transform hover:scale-105 active:scale-95"
                            aria-label="Remove image"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <CategoryPicker value={category} onChange={setCategory} />
                </div>

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
                      aria-label={images.length >= MAX_IMAGES ? 'Max 4 images' : 'Add images'}
                      className={`btn-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${
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
                      aria-label="Add video (max 256MB)"
                      className={`btn-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${
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

                  {/* Character ring — fills as you type, amber near the cap,
                      red when full; remaining count appears once you're close */}
                  <div className="flex items-center gap-2" aria-hidden>
                    {remaining <= 200 && (
                      <span
                        className={`text-xs font-medium tabular-nums ${
                          remaining <= 0 ? 'text-red-500' : 'text-amber-600'
                        }`}
                      >
                        {remaining}
                      </span>
                    )}
                    <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
                      <circle
                        cx="12"
                        cy="12"
                        r={RING_R}
                        fill="none"
                        strokeWidth="2.5"
                        className="stroke-neutral-500/20"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r={RING_R}
                        fill="none"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={RING_C}
                        strokeDashoffset={RING_C * (1 - fill)}
                        className={`transition-[stroke-dashoffset] duration-150 ${
                          remaining <= 0
                            ? 'stroke-red-500'
                            : remaining <= 200
                              ? 'stroke-amber-500'
                              : 'stroke-accent-400'
                        }`}
                      />
                    </svg>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
})

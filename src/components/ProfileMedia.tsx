'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'

import { updateProfileMedia } from '@/actions/users'
import { toCdnUrl } from '@/lib/cdn'
import { compressImage } from '@/lib/image'

import { Avatar } from './Avatar'
import { BlurImage } from './BlurImage'
import { ImageIcon } from './icons'
import { Spinner } from './Spinner'

export function ProfileMedia({
  isSelf,
  centered = false,
  avatarUrl,
  coverUrl,
  name,
  username,
  stats,
  children,
}: {
  isSelf: boolean
  centered?: boolean
  avatarUrl?: string
  coverUrl?: string
  name: string
  username: string
  stats?: ReactNode
  children?: ReactNode
}) {
  const router = useRouter()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const cover = coverPreview ?? coverUrl
  const avatar = avatarPreview ?? avatarUrl

  // Revoke object-URL previews when they're replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview)
    }
  }, [coverPreview])
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const upload = (kind: 'avatar' | 'cover', file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setError(null)
    const setPreview = kind === 'cover' ? setCoverPreview : setAvatarPreview
    startTransition(async () => {
      const compressed = await compressImage(file, {
        maxSize: kind === 'cover' ? 1920 : 800,
      })
      setPreview(URL.createObjectURL(compressed))
      const formData = new FormData()
      formData.set(kind, compressed)
      try {
        const result = await updateProfileMedia(formData)
        if (result?.error) throw new Error(result.error)
      } catch {
        setPreview(null)
        setError('Upload failed. Try a smaller image.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      onDragOver={
        isSelf
          ? (e) => {
              e.preventDefault()
              setDragging(true)
            }
          : undefined
      }
      onDragLeave={isSelf ? () => setDragging(false) : undefined}
      onDrop={
        isSelf
          ? (e) => {
              e.preventDefault()
              setDragging(false)
              upload('cover', e.dataTransfer.files?.[0])
            }
          : undefined
      }
    >
      {/* Cover photo — fills the entire profile card behind the info */}
      <div className="absolute inset-0">
        {cover ? (
          <BlurImage src={toCdnUrl(cover)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent-500 via-accent-500 to-accent-700" />
        )}
        {/* Scrim — keeps overlaid text readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/70" />
        {dragging && <div className="absolute inset-0 bg-accent-500/30" />}
      </div>

      {isSelf && (
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/60"
        >
          {pending ? <Spinner className="h-4 w-4 text-white" /> : <ImageIcon className="h-4 w-4" />}
          {dragging ? 'Drop to upload' : 'Edit cover'}
        </button>
      )}

      {error && (
        <p className="absolute right-4 top-12 z-10 rounded-full bg-red-500/90 px-3 py-1 text-xs font-medium text-white">
          {error}
        </p>
      )}

      {/* Avatar + name + action row — pushed down so the cover shows through */}
      <div className="relative px-5 pt-24 sm:px-6 sm:pt-28">
        <div
          className={`flex gap-4 ${
            centered ? 'flex-col items-center text-center' : 'items-center justify-between'
          }`}
        >
          <div
            className={`flex min-w-0 ${
              centered ? 'flex-col items-center gap-3' : 'items-center gap-4'
            }`}
          >
            <span
              role={isSelf ? 'button' : undefined}
              tabIndex={isSelf ? 0 : undefined}
              aria-label={isSelf ? 'Change profile photo' : undefined}
              onClick={isSelf ? () => avatarInputRef.current?.click() : undefined}
              onKeyDown={
                isSelf
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        avatarInputRef.current?.click()
                      }
                    }
                  : undefined
              }
              className={`group/avatar relative inline-flex shrink-0 rounded-full ring-4 ring-white/70 ${
                isSelf ? 'cursor-pointer' : ''
              }`}
            >
              <Avatar src={avatar ? toCdnUrl(avatar) : undefined} name={name} size="lg" />
              {isSelf && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition group-hover/avatar:bg-black/30 group-hover/avatar:opacity-100">
                  <ImageIcon className="h-5 w-5 text-white" />
                </span>
              )}
            </span>
            <div className="min-w-0">
              {stats && (
                <div className={`mb-1 flex gap-4 text-sm${centered ? ' justify-center' : ''}`}>
                  {stats}
                </div>
              )}
              <h1 className="truncate text-xl font-bold text-white drop-shadow-sm">{name}</h1>
              <p className="truncate text-sm text-white/75">@{username}</p>
            </div>
          </div>
          <span>{children}</span>
        </div>
      </div>

      {isSelf && (
        <>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => upload('cover', e.target.files?.[0])}
          />
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => upload('avatar', e.target.files?.[0])}
          />
        </>
      )}
    </div>
  )
}

'use client'

import { memo, useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { getUserMedia, type MediaItem, type MediaType } from '@/actions/posts'
import { toCdnUrl } from '@/lib/cdn'

import { BlurImage } from './BlurImage'
import { EmptyState } from './EmptyState'
import { ImageIcon, PlayIcon, VideoIcon } from './icons'
import { ImageLightbox } from './ImageLightbox'
import { LoadSentinel } from './LoadSentinel'
import { PostSheet } from './PostSheet'
import { Spinner } from './Spinner'

const MEDIA_TABS: { value: MediaType; label: string; icon: typeof ImageIcon }[] = [
  { value: 'images', label: 'Photos', icon: ImageIcon },
  { value: 'videos', label: 'Videos', icon: VideoIcon },
]

// Media wall for the profile — Photos / Videos sub-tabs. Each wall
// lazy-loads on first visit, then stays mounted so switching back keeps
// pagination (same pattern as the profile tab panels).
export function MediaGrid({
  authorId,
  publicOnly = false,
  isSelf = false,
  username,
}: {
  authorId: number
  publicOnly?: boolean
  isSelf?: boolean
  username: string
}) {
  const [type, setType] = useState<MediaType>('images')
  const [visited, setVisited] = useState<ReadonlySet<MediaType>>(() => new Set(['images']))

  const select = (next: MediaType) => {
    setType(next)
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
  }

  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        {MEDIA_TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => select(value)}
            aria-pressed={type === value}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
              type === value
                ? 'bg-accent-600 text-white shadow-md shadow-accent-600/30'
                : 'bg-black/5 text-neutral-600 hover:bg-accent-500/15 hover:text-accent-800'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {MEDIA_TABS.map(({ value, label }) =>
        visited.has(value) ? (
          <div key={value} hidden={type !== value}>
            <MediaWall
              authorId={authorId}
              publicOnly={publicOnly}
              mediaType={value}
              emptyMessage={
                isSelf
                  ? `${label} you post will show up here.`
                  : `@${username} hasn't shared ${label.toLowerCase()} yet.`
              }
            />
          </div>
        ) : null,
      )}
    </div>
  )
}

// One wall of tiles — image tiles open the lightbox, video tiles open the
// post sheet so the video is playable.
function MediaWall({
  authorId,
  publicOnly,
  mediaType,
  emptyMessage,
}: {
  authorId: number
  publicOnly: boolean
  mediaType: MediaType
  emptyMessage: string
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [pending, startTransition] = useTransition()
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [openPostId, setOpenPostId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void getUserMedia(authorId, 1, publicOnly, mediaType).then((result) => {
      if (cancelled) return
      setItems(result.items)
      setHasMore(result.hasMore)
    })
    return () => {
      cancelled = true
    }
  }, [authorId, publicOnly, mediaType])

  const loadMore = useCallback(() => {
    if (pending) return
    startTransition(async () => {
      const next = page + 1
      const result = await getUserMedia(authorId, next, publicOnly, mediaType)
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((i) => i.id))
        return [...(prev ?? []), ...result.items.filter((i) => !seen.has(i.id))]
      })
      setHasMore(result.hasMore)
      setPage(next)
    })
  }, [pending, page, authorId, publicOnly, mediaType])

  const urls = useMemo(() => (items ?? []).map((i) => i.url), [items])
  const closeLightbox = useCallback(() => setOpenIdx(null), [])
  const closePost = useCallback(() => setOpenPostId(null), [])

  if (items === null) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={mediaType === 'videos' ? <VideoIcon /> : <ImageIcon />}
        title={mediaType === 'videos' ? 'No videos yet' : 'No photos yet'}
        message={emptyMessage}
      />
    )
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
        {items.map((item, i) =>
          mediaType === 'videos' ? (
            <VideoTile
              key={item.id}
              url={item.url}
              onSelectAction={() => setOpenPostId(item.postId)}
            />
          ) : (
            <MediaTile key={item.id} url={item.url} index={i} onSelectAction={setOpenIdx} />
          ),
        )}
      </div>
      {mediaType === 'videos' ? (
        <PostSheet postId={openPostId ?? 0} open={openPostId !== null} onCloseAction={closePost} />
      ) : (
        <ImageLightbox
          urls={urls}
          index={openIdx}
          onNavigateAction={setOpenIdx}
          onCloseAction={closeLightbox}
        />
      )}
      <LoadSentinel hasMore={hasMore} pending={pending} onLoadAction={loadMore} />
    </>
  )
}

const MediaTile = memo(function MediaTile({
  url,
  index,
  onSelectAction,
}: {
  url: string
  index: number
  onSelectAction: (index: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectAction(index)}
      className="relative aspect-square cursor-zoom-in overflow-hidden bg-white/40"
    >
      <BlurImage
        src={toCdnUrl(url)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
      />
    </button>
  )
})

// Video thumbnail + play affordance — the stream thumbnail is already a
// full URL (not a CDN path), so no toCdnUrl here.
const VideoTile = memo(function VideoTile({
  url,
  onSelectAction,
}: {
  url: string
  onSelectAction: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelectAction}
      className="relative aspect-square overflow-hidden bg-neutral-900"
    >
      {url ? (
        <BlurImage
          src={url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-accent-100/70">
          <VideoIcon className="h-8 w-8 text-accent-400" />
        </span>
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
          <PlayIcon className="ml-0.5 h-4 w-4" fill="currentColor" stroke="none" />
        </span>
      </span>
    </button>
  )
})

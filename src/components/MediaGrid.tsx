'use client'

import { memo, useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { getUserMedia, type MediaItem } from '@/actions/posts'
import { toCdnUrl } from '@/lib/cdn'

import { BlurImage } from './BlurImage'
import { EmptyState } from './EmptyState'
import { ImageIcon } from './icons'
import { ImageLightbox } from './ImageLightbox'
import { LoadSentinel } from './LoadSentinel'
import { Spinner } from './Spinner'

// Media wall for the profile — lazy-loads every image the user has posted.
export function MediaGrid({
  authorId,
  publicOnly = false,
  emptyMessage,
}: {
  authorId: number
  publicOnly?: boolean
  emptyMessage?: string
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [pending, startTransition] = useTransition()
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void getUserMedia(authorId, 1, publicOnly).then((result) => {
      if (cancelled) return
      setItems(result.items)
      setHasMore(result.hasMore)
    })
    return () => {
      cancelled = true
    }
  }, [authorId, publicOnly])

  const loadMore = useCallback(() => {
    if (pending) return
    startTransition(async () => {
      const next = page + 1
      const result = await getUserMedia(authorId, next, publicOnly)
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((i) => i.id))
        return [...(prev ?? []), ...result.items.filter((i) => !seen.has(i.id))]
      })
      setHasMore(result.hasMore)
      setPage(next)
    })
  }, [pending, page, authorId, publicOnly])

  const urls = useMemo(() => (items ?? []).map((i) => i.url), [items])
  const closeLightbox = useCallback(() => setOpenIdx(null), [])

  if (items === null) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  if (items.length === 0) {
    return <EmptyState icon={<ImageIcon />} title="No photos yet" message={emptyMessage} />
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
        {items.map((item, i) => (
          <MediaTile key={item.id} url={item.url} index={i} onSelectAction={setOpenIdx} />
        ))}
      </div>
      <ImageLightbox
        urls={urls}
        index={openIdx}
        onNavigateAction={setOpenIdx}
        onCloseAction={closeLightbox}
      />
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

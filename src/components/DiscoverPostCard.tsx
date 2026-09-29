'use client'

import Link from 'next/link'
import { memo, useCallback, useRef, useState } from 'react'

import { CATEGORY_TINTS, postCategory } from '@/lib/categories'
import { toCdnUrl } from '@/lib/cdn'
import type { PostCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { BlurImage } from './BlurImage'
import { CategoryChip } from './CategoryChip'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { ImageLightbox } from './ImageLightbox'
import { PostVideo } from './PostVideo'
import { RelativeTime } from './RelativeTime'
import { TestimonialQuote } from './TestimonialQuote'

// Content-only post card for the public Discover page — no like/comment/
// share rail or save button; the card's shape is driven by the media like
// the Explore grid: videos get a reel-style tall player, photos get a
// media-first card, and text-only posts render as a pull-quote block.
// Discover excludes shared posts, so there's no share-card branch, and
// author links go to the public @handle pages.
export const DiscoverPostCard = memo(function DiscoverPostCard({ post }: { post: PostCardData }) {
  const entry = postCategory(post.category)
  const cardTint = entry ? CATEGORY_TINTS[entry.tint].card : ''

  if (post.video) return <ReelCard post={post} cardTint={cardTint} />
  if (post.images.length > 0) return <PhotoCard post={post} cardTint={cardTint} />
  return <QuoteCard post={post} cardTint={cardTint} />
})

// Video post — ReelPost minus the action rail: the video fills a tall frame
// with the author and caption floating on a scrim. Aspect-based height (not
// dvh) so the card scales with the masonry column's width.
function ReelCard({ post, cardTint }: { post: PostCardData; cardTint: string }) {
  return (
    <article
      className={`relative aspect-[3/4] max-h-[75dvh] w-full overflow-hidden rounded-3xl border bg-neutral-950 ${cardTint}`}
    >
      {post.video && <PostVideo video={post.video} variant="reel" />}

      {/* Legibility scrim behind the caption */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

      {/* Category badge — beside the reel player's mute button (top-left);
          solid so it stays readable over the video */}
      {post.category && (
        <CategoryChip category={post.category} solid className="absolute left-[52px] top-[19px]" />
      )}

      {/* Bottom-left author + caption overlay */}
      <div className="absolute inset-x-3 bottom-6 flex flex-col gap-2">
        <Link href={`/@${post.authorUsername}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {post.authorName} <BadgeMark badge={post.authorBadge} light />
            </p>
            <p className="truncate text-xs text-white/60">
              @{post.authorUsername} · <RelativeTime iso={post.createdAt} />
            </p>
          </div>
        </Link>
        {post.content && (
          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-snug text-white/90">
            {post.content}
          </p>
        )}
      </div>
    </article>
  )
}

// Photo post — PhotoPost minus the action row: header, full-bleed image
// (IG-style swipe carousel when the post has several), caption, timestamp.
function PhotoCard({ post, cardTint }: { post: PostCardData; cardTint: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [slide, setSlide] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const closeLightbox = useCallback(() => setOpenIdx(null), [])

  const goToSlide = (i: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  const images = post.images
  const urls = images.map((i) => i.url)
  const many = images.length > 1

  return (
    <article
      className={`glass overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-0.5 ${cardTint}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/@${post.authorUsername}`} className="flex min-w-0 items-center gap-3">
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {post.authorName} <BadgeMark badge={post.authorBadge} />
            </p>
            <p className="truncate text-xs text-neutral-500">@{post.authorUsername}</p>
          </div>
        </Link>
        {post.category && <CategoryChip category={post.category} className="ml-auto shrink-0" />}
      </div>

      {/* Full-bleed media — single image or swipe carousel */}
      {many ? (
        <div className="relative">
          <div
            ref={scrollerRef}
            className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
            onScroll={(e) => {
              const el = e.currentTarget
              setSlide(Math.round(el.scrollLeft / el.clientWidth))
            }}
          >
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setOpenIdx(i)}
                className="w-full shrink-0 cursor-zoom-in snap-center"
              >
                <BlurImage
                  src={toCdnUrl(img.url)}
                  alt=""
                  className="aspect-square w-full bg-neutral-200/70 object-cover"
                />
              </button>
            ))}
          </div>
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {slide + 1}/{images.length}
          </span>
          {slide > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => goToSlide(slide - 1)}
              className="glass absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-700 shadow-md transition-all hover:scale-105 active:scale-95"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          )}
          {slide < images.length - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => goToSlide(slide + 1)}
              className="glass absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-700 shadow-md transition-all hover:scale-105 active:scale-95"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          )}
          <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                aria-label={`Go to photo ${i + 1}`}
                onClick={() => goToSlide(i)}
                className={`h-1.5 w-1.5 rounded-full transition-all ${
                  i === slide ? 'w-3 bg-white' : 'bg-white/45 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>
      ) : (
        images[0] && (
          <button
            type="button"
            onClick={() => setOpenIdx(0)}
            className="block w-full cursor-zoom-in"
          >
            <BlurImage
              src={toCdnUrl(images[0].url)}
              alt=""
              className="max-h-[540px] w-full bg-neutral-200/70 object-cover"
            />
          </button>
        )
      )}

      {/* Caption + timestamp — no action row on the public page */}
      <div className="px-4 pb-4 pt-3">
        {post.content && (
          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-snug">
            <Link
              href={`/@${post.authorUsername}`}
              className="mr-1.5 font-semibold hover:underline"
            >
              {post.authorName}
            </Link>
            <BadgeMark badge={post.authorBadge} /> {post.content}
          </p>
        )}
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          <RelativeTime iso={post.createdAt} />
        </p>
      </div>

      <ImageLightbox
        urls={urls}
        index={openIdx}
        onNavigateAction={setOpenIdx}
        onCloseAction={closeLightbox}
      />
    </article>
  )
}

// Text-only post — a pull-quote block: the testimonial blockquote (accent
// rule, serif italic, faint quote mark) under a compact author header.
function QuoteCard({ post, cardTint }: { post: PostCardData; cardTint: string }) {
  return (
    <article
      className={`glass rounded-3xl p-4 transition-transform duration-300 hover:-translate-y-0.5 ${cardTint}`}
    >
      <div className="flex items-center gap-2.5">
        <Link
          href={`/@${post.authorUsername}`}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="xs" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {post.authorName} <BadgeMark badge={post.authorBadge} />
            </p>
            <p className="truncate text-[11px] leading-tight text-neutral-500">
              @{post.authorUsername} · <RelativeTime iso={post.createdAt} />
            </p>
          </div>
        </Link>
        {post.category && <CategoryChip category={post.category} className="shrink-0" />}
      </div>

      {post.content && (
        <div className="mt-3.5">
          <TestimonialQuote content={post.content} />
        </div>
      )}
    </article>
  )
}

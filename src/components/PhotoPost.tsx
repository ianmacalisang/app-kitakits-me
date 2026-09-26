'use client'

import Link from 'next/link'
import { memo, useCallback, useRef, useState } from 'react'

import { toCdnUrl } from '@/lib/cdn'
import type { PostCardData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { CategoryChip } from './CategoryChip'
import { BlurImage } from './BlurImage'
import { CommentsSheet } from './CommentsSheet'
import { ChevronLeftIcon, ChevronRightIcon, CommentIcon, LockIcon } from './icons'
import { ImageLightbox } from './ImageLightbox'
import { LikeButton } from './LikeButton'
import { SaveButton } from './SaveButton'
import { ShareButton } from './ShareButton'

// Instagram-feed-style card for the Photos filter — author header, then a
// full-bleed image (swipeable carousel when the post has several), then the
// action row, caption, and "View all comments" link. Still scrolls
// continuously like the normal feed, just media-first.
export const PhotoPost = memo(function PhotoPost({ post }: { post: PostCardData }) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [slide, setSlide] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const closeComments = useCallback(() => setCommentsOpen(false), [])
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
    <article className="glass overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-0.5">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/profile/${post.authorUsername}`} className="flex min-w-0 items-center gap-3">
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{post.authorName}</p>
            <p className="truncate text-xs text-neutral-500">
              @{post.authorUsername}
              {post.visibility === 'followers' && (
                <LockIcon className="ml-1 inline h-3 w-3 align-[-0.125em]" />
              )}
            </p>
          </div>
        </Link>
        {post.category && <CategoryChip category={post.category} className="ml-auto shrink-0" />}
      </div>

      {/* Full-bleed media — single image or IG-style swipe carousel */}
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
          {/* Slider arrows — appear only when there's somewhere to go */}
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

      {/* Action row — like / comment / share left, save right */}
      <div className="flex items-center gap-4 px-4 pt-3">
        <LikeButton
          postId={post.id}
          initialLiked={post.likedByMe}
          initialCount={post.likeCount}
          authenticated={post.viewerAuthenticated}
        />
        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          aria-label="View comments"
          className="flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
        >
          <CommentIcon className="h-5 w-5" />
          <span>{post.commentCount}</span>
        </button>
        {(post.canShare || !post.viewerAuthenticated) && (
          <ShareButton
            postId={post.sharedPost?.id ?? post.id}
            initialShared={post.sharedByMe}
            initialCount={post.shareCount}
            authenticated={post.viewerAuthenticated}
          />
        )}
        {!post.canEdit && (
          <span className="ml-auto">
            <SaveButton
              postId={post.id}
              initialSaved={post.savedByMe}
              initialCount={post.saveCount}
              authenticated={post.viewerAuthenticated}
            />
          </span>
        )}
      </div>

      {/* Caption + comments link + timestamp */}
      <div className="px-4 pb-4 pt-2">
        {post.content && (
          <p className="line-clamp-2 whitespace-pre-wrap text-sm leading-snug">
            <Link
              href={`/profile/${post.authorUsername}`}
              className="mr-1.5 font-semibold hover:underline"
            >
              {post.authorName}
            </Link>
            {post.content}
          </p>
        )}
        {post.commentCount > 0 && (
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="mt-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-700"
          >
            View all {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
          </button>
        )}
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          {formatRelativeTime(post.createdAt)}
        </p>
      </div>

      <ImageLightbox
        urls={urls}
        index={openIdx}
        onNavigateAction={setOpenIdx}
        onCloseAction={closeLightbox}
      />
      <CommentsSheet
        postId={post.id}
        open={commentsOpen}
        onCloseAction={closeComments}
        authenticated={post.viewerAuthenticated}
        commentsDisabled={post.commentsDisabled}
      />
    </article>
  )
})

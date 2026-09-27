'use client'

import Link from 'next/link'
import { memo, useCallback, useState } from 'react'

import { CATEGORY_TINTS, postCategory } from '@/lib/categories'
import { toCdnUrl } from '@/lib/cdn'
import type { PostCardData, PostVideoData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { BlurImage } from './BlurImage'
import { CategoryChip } from './CategoryChip'
import { CommentIcon, LockIcon, PlayIcon, ShareIcon, VideoIcon } from './icons'
import { LikeButton } from './LikeButton'
import { PostSheet } from './PostSheet'

const fmtDuration = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Compact card for the Explore grid that mirrors PostCard's structure —
// author header, content snippet, then media — with the media area laid out
// by post type: videos get a thumbnail + play affordance, images get the
// count-aware grid from PostImages, text posts stand on the snippet alone.
// Tapping the card opens the full post in a PostSheet.
export const ExplorePostCard = memo(function ExplorePostCard({
  post,
  wide = false,
}: {
  post: PostCardData
  // Full-width row in the explore grid — media tiles switch to a cinematic aspect.
  wide?: boolean
}) {
  const [postOpen, setPostOpen] = useState(false)
  const closePost = useCallback(() => setPostOpen(false), [])
  const openPost = useCallback(() => setPostOpen(true), [])

  // Shares display the embedded original, matching PostCard.
  const imageUrls = post.sharedPost ? post.sharedPost.imageUrls : post.images.map((i) => i.url)
  const video = post.sharedPost ? post.sharedPost.video : post.video
  const snippet = post.sharedPost ? post.sharedPost.content : post.content
  const categoryEntry = postCategory(post.category)

  return (
    <article
      className={`glass group flex flex-col rounded-3xl p-3.5 transition-transform duration-300 hover:-translate-y-0.5 ${
        categoryEntry ? CATEGORY_TINTS[categoryEntry.tint].card : ''
      }`}
    >
      {/* Author header — same shape as PostCard, plus the category badge */}
      <div className="flex items-center gap-2.5">
        <Link
          href={`/profile/${post.authorUsername}`}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="xs" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">{post.authorName}</p>
            <p className="truncate text-[11px] leading-tight text-neutral-500">
              @{post.authorUsername} · {formatRelativeTime(post.createdAt)}
              {post.visibility === 'followers' && (
                <LockIcon className="ml-1 inline h-3 w-3 align-[-0.125em]" />
              )}
            </p>
          </div>
        </Link>
        {post.category && <CategoryChip category={post.category} className="shrink-0" />}
      </div>

      {snippet && (
        <button type="button" onClick={openPost} className="mt-2 block w-full text-left">
          <p className="line-clamp-3 whitespace-pre-wrap text-[13px] leading-snug text-neutral-600">
            {snippet}
          </p>
        </button>
      )}

      {/* Media — layout depends on post type, like PostCard's media block */}
      {(video || imageUrls.length > 0) && (
        <button
          type="button"
          onClick={openPost}
          aria-label={`View post by ${post.authorName}`}
          className="relative mt-2.5 block w-full overflow-hidden rounded-2xl border border-black/5 text-left"
        >
          {video && imageUrls.length === 0 ? (
            <VideoTile video={video} wide={wide} />
          ) : (
            <ImageGrid urls={imageUrls} wide={wide} />
          )}

          {post.sharedPost && (
            <span
              className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
              title="Shared post"
            >
              <ShareIcon className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      )}

      <div className="flex-1" />

      <div className="mt-3 flex items-center gap-4 border-t border-black/5 pt-2.5">
        <LikeButton
          postId={post.id}
          initialLiked={post.likedByMe}
          initialCount={post.likeCount}
          authenticated={post.viewerAuthenticated}
        />
        <button
          type="button"
          onClick={openPost}
          aria-label="View comments"
          className="flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
        >
          <CommentIcon className="h-5 w-5" />
          <span>{post.commentCount}</span>
        </button>

        {post.likers.length > 0 && (
          <span
            className="ml-auto flex items-center -space-x-2"
            title={`Liked by ${post.likers.map((liker) => liker.name).join(', ')}`}
          >
            {post.likers.map((liker) => (
              <Link
                key={liker.username}
                href={`/profile/${liker.username}`}
                aria-label={liker.name}
                className="rounded-full ring-2 ring-white transition-transform hover:z-10 hover:scale-110"
              >
                <Avatar src={liker.avatarUrl} name={liker.name} size="xs" />
              </Link>
            ))}
          </span>
        )}
      </div>

      <PostSheet postId={post.id} open={postOpen} onCloseAction={closePost} />
    </article>
  )
})

// Video post — thumbnail with a centered play affordance, duration and play
// count badges. Still a preview: playback happens inside the PostSheet.
function VideoTile({ video, wide }: { video: PostVideoData; wide: boolean }) {
  const ready = video.status === 'ready'

  return (
    <div className={`relative w-full bg-neutral-900 ${wide ? 'aspect-video' : 'aspect-[4/3]'}`}>
      {ready && video.thumbnailUrl ? (
        <BlurImage
          src={video.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-accent-100/70">
          <VideoIcon className="h-8 w-8 text-accent-400" />
        </div>
      )}

      {ready && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
            <PlayIcon className="ml-0.5 h-6 w-6" fill="currentColor" stroke="none" />
          </span>
        </span>
      )}

      {ready && video.playCount > 0 && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {video.playCount} {video.playCount === 1 ? 'play' : 'plays'}
        </span>
      )}
      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
        {ready && video.duration != null ? fmtDuration(video.duration) : 'Processing…'}
      </span>
    </div>
  )
}

// Image post — count-aware grid matching PostImages:
//   1 → single cover · 2 → side-by-side · 3 → large left + two stacked ·
//   4+ → 2×2 with a "+N" overlay on the last tile
function ImageGrid({ urls, wide }: { urls: string[]; wide: boolean }) {
  const shown = urls.slice(0, 4)
  const extra = urls.length - shown.length
  const aspect = wide ? 'aspect-video' : 'aspect-[4/3]'

  if (shown.length === 1) {
    return (
      <BlurImage
        src={toCdnUrl(urls[0])}
        alt=""
        loading="lazy"
        className={`${aspect} w-full bg-neutral-200/70 object-cover transition-transform duration-300 group-hover:scale-[1.03]`}
      />
    )
  }

  return (
    <div className={`grid ${aspect} w-full grid-cols-2 grid-rows-2 gap-0.5`}>
      {shown.map((url, i) => (
        <div
          key={url + i}
          className={`relative overflow-hidden ${
            shown.length === 2 ? 'row-span-2' : shown.length === 3 && i === 0 ? 'row-span-2' : ''
          }`}
        >
          <BlurImage
            src={toCdnUrl(url)}
            alt=""
            loading="lazy"
            className="h-full w-full bg-neutral-200/70 object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {extra > 0 && i === shown.length - 1 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">
              +{extra}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

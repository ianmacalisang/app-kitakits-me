'use client'

import Link from 'next/link'
import { memo, useCallback, useState } from 'react'

import { toCdnUrl } from '@/lib/cdn'
import type { PostCardData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { BlurImage } from './BlurImage'
import { CommentIcon, LockIcon, ShareIcon, VideoIcon } from './icons'
import { LikeButton } from './LikeButton'
import { PostSheet } from './PostSheet'

// Compact, media-first card for the Explore posts grid — cover image (or a
// content preview for imageless posts), author line, and a slim engagement
// row. Tapping the card opens the full post in a PostSheet.
export const ExplorePostCard = memo(function ExplorePostCard({ post }: { post: PostCardData }) {
  const [postOpen, setPostOpen] = useState(false)
  const closePost = useCallback(() => setPostOpen(false), [])
  const openPost = useCallback(() => setPostOpen(true), [])

  // Shares display the embedded original, matching PostCard.
  const imageUrls = post.sharedPost ? post.sharedPost.imageUrls : post.images.map((i) => i.url)
  const video = post.sharedPost ? post.sharedPost.video : post.video
  // Bunny's thumbnail doesn't exist until encoding finishes — fall back to
  // the text preview while a video-only post is still processing.
  const cover =
    toCdnUrl(imageUrls[0]) ?? (video?.status === 'ready' ? video.thumbnailUrl : undefined)
  const extraImages = imageUrls.length - 1
  const snippet = post.sharedPost ? post.sharedPost.content : post.content

  return (
    <article className="glass group flex flex-col overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-0.5">
      <button
        type="button"
        onClick={openPost}
        aria-label={`View post by ${post.authorName}`}
        className="relative block w-full overflow-hidden text-left"
      >
        {cover ? (
          <BlurImage
            src={cover}
            alt=""
            loading="lazy"
            className="aspect-[4/5] w-full bg-neutral-200/70 object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center bg-gradient-to-br from-emerald-100/70 via-teal-50 to-emerald-200/50 p-4">
            <p className="line-clamp-[9] whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
              {snippet ?? 'Shared a post'}
            </p>
          </div>
        )}

        {extraImages > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
            +{extraImages}
          </span>
        )}
        {post.sharedPost && (
          <span
            className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
            title="Shared post"
          >
            <ShareIcon className="h-3.5 w-3.5" />
          </span>
        )}
        {video && imageUrls.length === 0 && (
          <span
            className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
            title="Video"
          >
            <VideoIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col p-3">
        <Link href={`/profile/${post.authorUsername}`} className="flex min-w-0 items-center gap-2">
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="xs" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">{post.authorName}</p>
            <p className="truncate text-[11px] leading-tight text-neutral-500">
              {formatRelativeTime(post.createdAt)}
              {post.visibility === 'followers' && (
                <LockIcon className="ml-1 inline h-3 w-3 align-[-0.125em]" />
              )}
            </p>
          </div>
        </Link>

        {cover && snippet && (
          <button type="button" onClick={openPost} className="mt-2 block w-full text-left">
            <p className="line-clamp-2 whitespace-pre-wrap text-[13px] leading-snug text-neutral-600">
              {snippet}
            </p>
          </button>
        )}

        <div className="flex-1" />

        <div className="mt-2 flex items-center gap-4 border-t border-black/5 pt-2">
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
      </div>

      <PostSheet postId={post.id} open={postOpen} onCloseAction={closePost} />
    </article>
  )
})

'use client'

import Link from 'next/link'
import { memo, type ReactNode, useCallback, useState } from 'react'

import { CATEGORY_TINTS, postCategory } from '@/lib/categories'
import { toCdnUrl } from '@/lib/cdn'
import type { PostCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { BlurImage } from './BlurImage'
import { CommentIcon, HeartIcon, LockIcon, PlayIcon, VideoIcon } from './icons'
import { PostSheet } from './PostSheet'

// Uniform media tile for the Explore rails — the photo or video thumbnail
// fills a fixed-aspect card with author and engagement floating on a scrim.
// Text-only posts get a category-tinted panel carrying the snippet instead.
// Tapping the tile opens the full post in a PostSheet.
export const RailPostCard = memo(function RailPostCard({
  post,
  badge,
  aspectClass = 'aspect-[3/4]',
  overlaySnippet = false,
}: {
  post: PostCardData
  badge?: ReactNode
  /** Tile aspect ratio — landscape for text-forward cards like questions. */
  aspectClass?: string
  /** Center the snippet over the media — question-card treatment. */
  overlaySnippet?: boolean
}) {
  const [postOpen, setPostOpen] = useState(false)
  const closePost = useCallback(() => setPostOpen(false), [])
  const openPost = useCallback(() => setPostOpen(true), [])

  // Shares display the embedded original, matching ExplorePostCard.
  const imageUrls = post.sharedPost ? post.sharedPost.imageUrls : post.images.map((i) => i.url)
  const video = post.sharedPost ? post.sharedPost.video : post.video
  const snippet = post.sharedPost ? post.sharedPost.content : post.content

  const thumb =
    (imageUrls[0] ? toCdnUrl(imageUrls[0]) : undefined) ??
    (video?.status === 'ready' ? video.thumbnailUrl : undefined)
  const hasMedia = Boolean(thumb) || Boolean(video)

  return (
    <article
      className={`group relative w-full overflow-hidden rounded-3xl ${aspectClass} ${
        hasMedia ? 'bg-neutral-900' : 'bg-black/5'
      }`}
    >
      <button
        type="button"
        onClick={openPost}
        aria-label={`View post by ${post.authorName}`}
        className="absolute inset-0 block h-full w-full"
      >
        {thumb ? (
          <BlurImage
            src={thumb}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : video ? (
          <div className="flex h-full w-full items-center justify-center bg-accent-100/70">
            <VideoIcon className="h-8 w-8 text-accent-400" />
          </div>
        ) : (
          // Text-only tile — category-tinted panel with the snippet
          <TextTile
            snippet={snippet}
            category={post.sharedPost?.category ?? post.category}
            centered={overlaySnippet}
          />
        )}
      </button>

      {/* Snippet centered over the media (question-card sections) — needs a
          scrim to stay readable on photos */}
      {overlaySnippet && snippet && hasMedia && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 p-4 pb-16 text-center">
          <p className="line-clamp-4 whitespace-pre-wrap text-[15px] font-semibold leading-snug text-white drop-shadow-md">
            “{snippet}”
          </p>
        </div>
      )}

      {/* Centered play affordance on videos — a corner pill when the
          snippet overlay occupies the center */}
      {video &&
        (overlaySnippet ? (
          <span className="pointer-events-none absolute bottom-16 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <PlayIcon className="ml-0.5 h-3.5 w-3.5" fill="currentColor" stroke="none" />
          </span>
        ) : (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
              <PlayIcon className="ml-0.5 h-5 w-5" fill="currentColor" stroke="none" />
            </span>
          </span>
        ))}

      {/* Section badge — e.g. the "Unanswered" pill on Tanong tiles */}
      {badge && <span className="absolute left-2 top-2">{badge}</span>}

      {/* Extra-photo count, matching ImageGrid's +N overlay */}
      {imageUrls.length > 1 && (
        <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
          +{imageUrls.length - 1}
        </span>
      )}

      {/* Legibility scrim behind the author + stats — media tiles only;
          text tiles get a frosted footer band instead */}
      {hasMedia && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      )}

      <div
        className={
          hasMedia
            ? 'absolute inset-x-3 bottom-3'
            : 'absolute inset-x-0 bottom-0 border-t border-black/5 bg-white/70 px-3 py-2 backdrop-blur-sm dark:border-white/10 dark:bg-neutral-950/70'
        }
      >
        <Link href={`/profile/${post.authorUsername}`} className="flex min-w-0 items-center gap-2">
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="xs" />
          <p
            className={`truncate text-xs font-semibold ${
              hasMedia ? 'text-white' : 'text-neutral-800 dark:text-neutral-100'
            }`}
          >
            {post.authorName} <BadgeMark badge={post.authorBadge} light={hasMedia} />
            {post.visibility === 'followers' && (
              <LockIcon
                className={`ml-1 inline h-3 w-3 align-[-0.125em] ${
                  hasMedia ? 'text-white/70' : 'text-neutral-400'
                }`}
              />
            )}
          </p>
        </Link>
        <div
          className={`mt-1.5 flex items-center gap-3 text-[11px] font-medium ${
            hasMedia ? 'text-white/85' : 'text-neutral-500'
          }`}
        >
          <span className="flex items-center gap-1">
            <HeartIcon className="h-3.5 w-3.5" />
            {post.likeCount}
          </span>
          <span className="flex items-center gap-1">
            <CommentIcon className="h-3.5 w-3.5" />
            {post.commentCount}
          </span>
        </div>
      </div>

      <PostSheet postId={post.id} open={postOpen} onCloseAction={closePost} />
    </article>
  )
})

// Text-only fallback tile — the category icon and tint mark the post type,
// the snippet carries the content (used by text posts like unanswered
// Tanong questions, which can appear in rails without media).
function TextTile({
  snippet,
  category,
  centered = false,
}: {
  snippet: string | null
  category: string | null
  /** Question-card look — centers the snippet instead of top-anchoring it. */
  centered?: boolean
}) {
  const entry = postCategory(category)
  const tint = entry ? CATEGORY_TINTS[entry.tint] : undefined
  return (
    // pt-10 clears the top-left section badge in the anchored layout; the
    // footer overlay covers the bottom, so centered text gets extra padding
    // to clear it.
    <div
      className={`flex h-full w-full flex-col p-4 ${
        centered ? 'items-center justify-center pb-14 pt-10 text-center' : 'pt-10'
      } ${entry ? tint!.card : 'bg-black/5'}`}
    >
      {snippet && (
        <p className="line-clamp-4 whitespace-pre-wrap text-[15px] font-semibold leading-snug text-neutral-800 dark:text-neutral-100">
          “{snippet}”
        </p>
      )}
    </div>
  )
}

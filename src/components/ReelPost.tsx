'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'

import type { PostCardData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { CommentsSheet } from './CommentsSheet'
import { CommentIcon, LockIcon } from './icons'
import { LikeButton } from './LikeButton'
import { PostVideo } from './PostVideo'
import { SaveButton } from './SaveButton'
import { ShareButton } from './ShareButton'

// Reels-style card for the Videos feed filter — the video fills a tall
// snap-friendly frame while author, caption, and the action rail float on
// top, like the reels section on Facebook.
export function ReelPost({ post }: { post: PostCardData }) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const closeComments = useCallback(() => setCommentsOpen(false), [])

  return (
    <article className="relative h-[75dvh] w-full overflow-hidden rounded-3xl bg-neutral-950">
      {post.video && <PostVideo video={post.video} variant="reel" />}

      {/* Legibility scrim behind the caption + rail */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

      {/* Right-side action rail — like / comment / share / save */}
      <div className="absolute bottom-16 right-2.5 flex flex-col items-center gap-4 text-sm">
        <LikeButton
          postId={post.id}
          initialLiked={post.likedByMe}
          initialCount={post.likeCount}
          authenticated={post.viewerAuthenticated}
          onDark
        />
        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          aria-label="View comments"
          className="flex items-center gap-1.5 text-sm text-white/85 transition-colors hover:text-white"
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
            onDark
          />
        )}
        {!post.canEdit && (
          <SaveButton
            postId={post.id}
            initialSaved={post.savedByMe}
            initialCount={post.saveCount}
            authenticated={post.viewerAuthenticated}
            onDark
          />
        )}
      </div>

      {/* Bottom-left author + caption overlay */}
      <div className="absolute inset-x-3 bottom-6 right-16 flex flex-col gap-2">
        <Link
          href={`/profile/${post.authorUsername}`}
          className="flex min-w-0 items-center gap-2.5"
        >
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{post.authorName}</p>
            <p className="truncate text-xs text-white/60">
              @{post.authorUsername} · {formatRelativeTime(post.createdAt)}
              {post.visibility === 'followers' && (
                <LockIcon className="ml-1 inline h-3 w-3 align-[-0.125em]" />
              )}
            </p>
          </div>
        </Link>
        {post.content && (
          <p className="line-clamp-2 whitespace-pre-wrap text-sm leading-snug text-white/90">
            {post.content}
          </p>
        )}
      </div>

      <CommentsSheet
        postId={post.id}
        open={commentsOpen}
        onCloseAction={closeComments}
        authenticated={post.viewerAuthenticated}
        commentsDisabled={post.commentsDisabled}
      />
    </article>
  )
}

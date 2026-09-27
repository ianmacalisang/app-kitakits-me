'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { memo, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { deletePost, togglePin } from '@/actions/posts'
import { CATEGORY_TINTS, postCategory } from '@/lib/categories'
import type { PostCardData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { CategoryChip } from './CategoryChip'
import { CommentsSheet } from './CommentsSheet'
import { CommentIcon, LockIcon, PinIcon, TrashIcon } from './icons'
import { LikeButton } from './LikeButton'
import { SaveButton } from './SaveButton'
import { ShareButton } from './ShareButton'
import { PostEditForm } from './PostEditForm'
import { PostImages } from './PostImages'
import { PostVideo } from './PostVideo'

const CLOSE_MS = 300
const CONTENT_PREVIEW_LEN = 300

// Collapses long text behind an inline "See more" toggle.
function ExpandableText({ content, className }: { content: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > CONTENT_PREVIEW_LEN
  const shown =
    isLong && !expanded
      ? content
          .slice(0, CONTENT_PREVIEW_LEN)
          .replace(/\s+\S*$/, '')
          .trimEnd()
      : content

  return (
    <div className={className}>
      <p className="whitespace-pre-wrap leading-relaxed">
        {shown}
        {isLong && (
          <>
            {!expanded && '…'}{' '}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="font-medium text-accent-600 transition-colors hover:text-accent-700"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          </>
        )}
      </p>
    </div>
  )
}

export const PostCard = memo(function PostCard({ post }: { post: PostCardData }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [pinning, startPin] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteClosing, setDeleteClosing] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editClosing, setEditClosing] = useState(false)

  const imageUrls = useMemo(() => post.images.map((i) => i.url), [post.images])
  const closeComments = useCallback(() => setCommentsOpen(false), [])
  const openComments = useCallback(() => setCommentsOpen(true), [])

  const closeEdit = useCallback(() => {
    if (editClosing) return
    setEditClosing(true)
    setTimeout(() => {
      setEditOpen(false)
      setEditClosing(false)
    }, CLOSE_MS)
  }, [editClosing])

  const closeDelete = useCallback(() => {
    if (deleteClosing || deleting) return
    setDeleteClosing(true)
    setTimeout(() => {
      setDeleteOpen(false)
      setDeleteClosing(false)
      setDeleteError(null)
    }, CLOSE_MS)
  }, [deleteClosing, deleting])

  // Lock scroll and support Escape while a sheet is open.
  useEffect(() => {
    if (!editOpen && !deleteOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (deleteOpen) closeDelete()
      else closeEdit()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [editOpen, deleteOpen, closeEdit, closeDelete])

  const handlePin = () => {
    startPin(async () => {
      const result = await togglePin(post.id)
      if (!result.error) router.refresh()
    })
  }

  const handleDelete = () => {
    setDeleteError(null)
    startDelete(async () => {
      const result = await deletePost(post.id)
      if (result.error) {
        setDeleteError(result.error)
      } else {
        setDeleteOpen(false)
        router.refresh()
      }
    })
  }

  const categoryEntry = postCategory(post.category)

  return (
    <article
      className={`glass rounded-3xl p-4 transition-transform duration-300 hover:-translate-y-0.5 ${
        categoryEntry ? CATEGORY_TINTS[categoryEntry.tint].card : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/profile/${post.authorUsername}`} className="flex min-w-0 items-center gap-3">
          <Avatar src={post.authorAvatarUrl} name={post.authorName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{post.authorName}</p>
            <p className="truncate text-xs text-neutral-500">
              @{post.authorUsername} · {formatRelativeTime(post.createdAt)}
              {post.visibility === 'followers' && (
                <LockIcon className="ml-1 inline h-3 w-3 align-[-0.125em]" />
              )}
            </p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          {post.category && <CategoryChip category={post.category} />}
          {post.canEdit ? (
            <div className="flex items-center gap-2 text-xs">
              {!post.sharedPost && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-neutral-500 transition-colors hover:text-neutral-900"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => setDeleteOpen(true)}
                className="text-neutral-500 transition-colors hover:text-red-600"
              >
                Delete
              </button>
              {/* Pin is public-only, but stays visible on a pinned post so it
                  can still be unpinned after a visibility change. */}
              {!post.sharedPost && (post.visibility === 'public' || post.pinned) && (
                <button
                  type="button"
                  onClick={handlePin}
                  disabled={pinning}
                  aria-label={post.pinned ? 'Unpin post' : 'Pin post'}
                  aria-pressed={post.pinned}
                  title={post.pinned ? 'Unpin post' : 'Pin post'}
                  className={`flex items-center transition-colors disabled:opacity-50 ${
                    post.pinned ? 'text-accent-600' : 'text-neutral-500 hover:text-accent-600'
                  }`}
                >
                  <PinIcon className="h-4 w-4" filled={post.pinned} />
                </button>
              )}
            </div>
          ) : (
            <SaveButton
              postId={post.id}
              initialSaved={post.savedByMe}
              initialCount={post.saveCount}
              authenticated={post.viewerAuthenticated}
            />
          )}
        </div>
      </div>

      {post.sharedPost ? (
        // Share card — the original post embedded read-only.
        <div className="mt-3 rounded-2xl border border-accent-900/10 bg-accent-50/50 p-3">
          <Link
            href={`/profile/${post.sharedPost.authorUsername}`}
            className="flex min-w-0 items-center gap-2"
          >
            <Avatar
              src={post.sharedPost.authorAvatarUrl}
              name={post.sharedPost.authorName}
              size="xs"
            />
            <p className="truncate text-xs text-neutral-500">
              <span className="text-sm font-semibold text-neutral-900">
                {post.sharedPost.authorName}
              </span>{' '}
              @{post.sharedPost.authorUsername} · {formatRelativeTime(post.sharedPost.createdAt)}
            </p>
          </Link>
          {post.sharedPost.content && (
            <ExpandableText content={post.sharedPost.content} className="mt-2 text-sm" />
          )}
          {post.sharedPost.imageUrls.length > 0 && <PostImages urls={post.sharedPost.imageUrls} />}
          {post.sharedPost.video && <PostVideo video={post.sharedPost.video} />}
        </div>
      ) : (
        <>
          {post.content && <ExpandableText content={post.content} className="mt-3 text-sm" />}

          {imageUrls.length > 0 && <PostImages urls={imageUrls} />}
          {post.video && <PostVideo video={post.video} />}
        </>
      )}

      <div className="mt-3 flex items-center gap-4 border-t border-black/5 pt-3">
        <LikeButton
          postId={post.id}
          initialLiked={post.likedByMe}
          initialCount={post.likeCount}
          authenticated={post.viewerAuthenticated}
        />
        <button
          type="button"
          onClick={openComments}
          aria-label="View comments"
          className="flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
        >
          <CommentIcon className="h-5 w-5" />
          <span>{post.commentCount}</span>
        </button>
        {post.canShare || !post.viewerAuthenticated ? (
          <ShareButton
            postId={post.sharedPost?.id ?? post.id}
            initialShared={post.sharedByMe}
            initialCount={post.shareCount}
            authenticated={post.viewerAuthenticated}
          />
        ) : (
          post.visibility === 'public' &&
          !(post.sharedPost && post.canEdit) && (
            <span className="text-sm text-neutral-500">
              {post.shareCount} {post.shareCount === 1 ? 'Share' : 'Shares'}
            </span>
          )
        )}
        {/* Your own posts have no save button — show the count in the stats
            row instead. */}
        {post.canEdit && post.saveCount > 0 && (
          <span className="text-sm text-neutral-500">
            {post.saveCount} {post.saveCount === 1 ? 'Save' : 'Saves'}
          </span>
        )}

        {/* Overlapping avatars of recent likers */}
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

      {/* Latest comments preview — tap to open the full thread */}
      {post.latestComments.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {post.latestComments.map((comment, i) => (
            <button
              key={i}
              type="button"
              onClick={openComments}
              className="flex items-center gap-2 text-left"
            >
              <Avatar src={comment.authorAvatarUrl} name={comment.authorName} size="xs" />
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">{comment.authorName}</span>{' '}
                <span className="text-neutral-600">{comment.content}</span>
              </p>
            </button>
          ))}
        </div>
      )}

      <CommentsSheet
        postId={post.id}
        open={commentsOpen}
        onCloseAction={closeComments}
        authenticated={post.viewerAuthenticated}
        commentsDisabled={post.commentsDisabled}
      />

      {/* Edit sheet */}
      {editOpen &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
            <div
              className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
                editClosing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
              }`}
              onClick={closeEdit}
            />
            <div
              className={`glass relative flex h-[70dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:h-auto sm:max-h-[85vh] sm:rounded-[28px] ${
                editClosing
                  ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
                  : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
              }`}
            >
              <div className="mx-auto mb-1 mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" />

              <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 pb-3 pt-1 sm:pt-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800"
                >
                  Cancel
                </button>
                <h2 className="text-[15px] font-semibold">Edit post</h2>
                <span className="w-14" />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <PostEditForm
                  postId={post.id}
                  initialContent={post.content ?? ''}
                  initialVisibility={post.visibility}
                  initialCategory={post.category}
                  images={post.images}
                  video={post.video}
                  onDoneAction={closeEdit}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Delete confirmation dialog */}
      {deleteOpen &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
            <div
              className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
                deleteClosing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
              }`}
              onClick={closeDelete}
            />
            <div
              role="alertdialog"
              aria-label="Delete post"
              className={`glass relative flex w-full max-w-sm flex-col rounded-t-[28px] p-6 sm:rounded-[28px] ${
                deleteClosing
                  ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
                  : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
              }`}
            >
              <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" />

              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <TrashIcon className="h-5 w-5" />
                </span>
                <h2 className="text-[15px] font-semibold">Delete this post?</h2>
                <p className="text-sm text-neutral-500">This can&apos;t be undone.</p>
              </div>

              {deleteError && (
                <p className="mt-3 text-center text-sm text-red-600">{deleteError}</p>
              )}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={closeDelete}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-black/5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-black/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/30 transition-all hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </article>
  )
})

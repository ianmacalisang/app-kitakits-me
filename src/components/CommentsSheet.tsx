import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { memo, useCallback, useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { getComments } from '@/actions/comments'
import { getPost } from '@/actions/posts'
import { CATEGORY_TINTS, postCategory } from '@/lib/categories'
import { emitPostUpdated } from '@/lib/events'
import type { CommentData, PostCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { CategoryChip, RepostBadge } from './CategoryChip'
import { CommentForm } from './CommentForm'
import { CommentList } from './CommentList'
import { ExpandableText } from './ExpandableText'
import { LockIcon, UsersIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { PostImages } from './PostImages'
import { PostVideo } from './PostVideo'
import { RelativeTime } from './RelativeTime'
import { Spinner } from './Spinner'
import { useSheetDragClose } from './useSheetDrag'

const CLOSE_MS = 300

// Controlled comments sheet — parent owns `open`; comments lazy-load on first open.
export const CommentsSheet = memo(function CommentsSheet({
  postId,
  open,
  onCloseAction,
  authenticated = true,
  commentsDisabled = false,
  showPost = false,
}: {
  postId: number
  open: boolean
  onCloseAction: () => void
  authenticated?: boolean
  commentsDisabled?: boolean
  // Show the post itself at the top of the thread — for sheets opened
  // somewhere the post isn't already on the page (e.g. a notification).
  showPost?: boolean
}) {
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const [comments, setComments] = useState<CommentData[] | null>(null)
  const [commentsPage, setCommentsPage] = useState(1)
  const [commentsMore, setCommentsMore] = useState(false)
  const [morePending, startMoreTransition] = useTransition()
  // Server value from getComments wins over the prop — the prop is just the
  // initial hint from PostCardData (sheets opened elsewhere have no hint).
  const [disabled, setDisabled] = useState(commentsDisabled)
  const [post, setPost] = useState<PostCardData | null>(null)
  const [postMissing, setPostMissing] = useState(false)

  // Reset loaded comments when the sheet moves to a different post.
  const [prevPostId, setPrevPostId] = useState(postId)
  if (prevPostId !== postId) {
    setPrevPostId(postId)
    setComments(null)
    setCommentsPage(1)
    setCommentsMore(false)
    setDisabled(commentsDisabled)
    setPost(null)
    setPostMissing(false)
  }

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      onCloseAction()
      setClosing(false)
    }, CLOSE_MS)
  }, [closing, onCloseAction])

  const sheetDrag = useSheetDragClose(close)

  const load = useCallback(async () => {
    const result = await getComments(postId, 1)
    setComments(result.items)
    setCommentsPage(1)
    setCommentsMore(result.hasMore)
    setDisabled(result.commentsDisabled)
  }, [postId])

  const loadMore = useCallback(() => {
    if (morePending) return
    startMoreTransition(async () => {
      const next = commentsPage + 1
      const result = await getComments(postId, next)
      setComments((prev) => {
        const seen = new Set((prev ?? []).map((c) => c.id))
        return [...(prev ?? []), ...result.items.filter((c) => !seen.has(c.id))]
      })
      setCommentsPage(next)
      setCommentsMore(result.hasMore)
      setDisabled(result.commentsDisabled)
    })
  }, [morePending, commentsPage, postId])

  const changed = useCallback(() => {
    void load()
    // Comment count + latest-comments preview patch on every mounted card,
    // including posts past the router.refresh() reconcile window.
    void getPost(postId).then((post) => {
      if (post) emitPostUpdated(post)
    })
    router.refresh()
  }, [load, router, postId])

  // Lazy-load on first open.
  useEffect(() => {
    if (!open || comments !== null) return
    let cancelled = false
    void getComments(postId, 1).then((result) => {
      if (cancelled) return
      setComments(result.items)
      setCommentsPage(1)
      setCommentsMore(result.hasMore)
      setDisabled(result.commentsDisabled)
    })
    return () => {
      cancelled = true
    }
  }, [open, comments, postId])

  // Lazy-load the post header on first open.
  useEffect(() => {
    if (!showPost || !open || post !== null || postMissing) return
    let cancelled = false
    void getPost(postId).then((result) => {
      if (cancelled) return
      if (result) setPost(result)
      else setPostMissing(true)
    })
    return () => {
      cancelled = true
    }
  }, [showPost, open, post, postMissing, postId])

  // Lock scroll and support Escape while the sheet is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className={`absolute inset-0 bg-accent-950/40 backdrop-blur-sm ${
          closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
        }`}
        onClick={close}
      />
      <div
        {...sheetDrag}
        className={`glass relative flex h-dvh w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:h-[75dvh] sm:rounded-[28px] ${
          closing
            ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
            : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
        }`}
      >
        {/* iOS sheet drag handle (mobile) */}
        <div
          data-sheet-handle
          className="mx-auto mb-1 mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden"
        />

        {/* Header: Cancel / title / spacer */}
        <div
          data-sheet-handle
          className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 pb-3 pt-1 sm:pt-3"
        >
          <button
            type="button"
            onClick={close}
            className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800"
          >
            Cancel
          </button>
          <h2 className="text-[15px] font-semibold">Comments</h2>
          <span className="w-14" />
        </div>

        {/* Scrollable post context + comment list */}
        <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-none px-5">
          {showPost && (
            <div className="border-b border-black/5">
              {post === null ? (
                postMissing ? (
                  <p className="py-3 text-sm italic text-neutral-400">
                    This post is no longer available.
                  </p>
                ) : (
                  <div className="flex justify-center py-4">
                    <Spinner />
                  </div>
                )
              ) : (
                <SheetPost post={post} />
              )}
            </div>
          )}
          {comments === null ? (
            <div className="flex h-full min-h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <>
              <CommentList comments={comments} onChangedAction={changed} />
              <LoadSentinel hasMore={commentsMore} pending={morePending} onLoadAction={loadMore} />
            </>
          )}
        </div>

        {/* Pinned comment input — login prompt for signed-out readers */}
        <div className="shrink-0 border-t border-black/5 px-5 py-3">
          {disabled ? (
            <p className="py-1.5 text-center text-sm text-neutral-500">Commenting is disabled</p>
          ) : authenticated ? (
            <CommentForm postId={postId} onSubmittedAction={changed} />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-neutral-500">Log in to join the conversation.</p>
              <Link href="/login" className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm">
                Log in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
})

// Read-only post context above the thread — mirrors PostCard's header and
// body (including the embedded card for shares) without the action row.
const SheetPost = memo(function SheetPost({ post }: { post: PostCardData }) {
  const sharedEntry = postCategory(post.sharedPost?.category)
  return (
    <div className="pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/profile/${post.authorUsername}`}
          className="flex min-w-0 items-center gap-2.5"
        >
          <Avatar src={post.authorAvatarUrl} name={post.authorName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {post.authorName} <BadgeMark badge={post.authorBadge} />
            </span>
            <span className="block truncate text-xs text-neutral-500">
              @{post.authorUsername} · <RelativeTime iso={post.createdAt} />
              {post.visibility === 'followers' && (
                <LockIcon className="ml-1 inline h-3 w-3 align-[-0.125em]" />
              )}
              {post.visibility === 'mutuals' && (
                <UsersIcon className="ml-1 inline h-3 w-3 align-[-0.125em]" />
              )}
            </span>
          </span>
        </Link>
        {post.sharedPost ? (
          <RepostBadge className="shrink-0" />
        ) : (
          post.category && <CategoryChip category={post.category} className="shrink-0" />
        )}
      </div>

      {post.sharedPost ? (
        // Share card — the original post embedded read-only.
        <div
          className={`mt-3 rounded-2xl border p-3 ${
            sharedEntry
              ? CATEGORY_TINTS[sharedEntry.tint].card
              : 'border-accent-900/10 bg-accent-50/50'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/profile/${post.sharedPost.authorUsername}`}
              className="flex min-w-0 flex-1 items-center gap-2"
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
                <BadgeMark badge={post.sharedPost.authorBadge} /> @{post.sharedPost.authorUsername}{' '}
                · <RelativeTime iso={post.sharedPost.createdAt} />
              </p>
            </Link>
            <CategoryChip category={post.sharedPost.category} className="shrink-0" />
          </div>
          {post.sharedPost.content && (
            <ExpandableText content={post.sharedPost.content} className="mt-2 text-sm" />
          )}
          {post.sharedPost.imageUrls.length > 0 && <PostImages urls={post.sharedPost.imageUrls} />}
          {post.sharedPost.video && <PostVideo video={post.sharedPost.video} />}
        </div>
      ) : (
        <>
          {post.content && <ExpandableText content={post.content} className="mt-2.5 text-sm" />}
          <PostImages urls={post.images.map((i) => i.url)} />
          {post.video && <PostVideo video={post.video} />}
        </>
      )}
    </div>
  )
})

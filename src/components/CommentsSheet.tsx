import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { memo, useCallback, useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { getComments } from '@/actions/comments'
import type { CommentData } from '@/lib/serialize'

import { CommentForm } from './CommentForm'
import { CommentList } from './CommentList'
import { LoadSentinel } from './LoadSentinel'
import { Spinner } from './Spinner'

const CLOSE_MS = 300

// Controlled comments sheet — parent owns `open`; comments lazy-load on first open.
export const CommentsSheet = memo(function CommentsSheet({
  postId,
  open,
  onCloseAction,
  authenticated = true,
  commentsDisabled = false,
}: {
  postId: number
  open: boolean
  onCloseAction: () => void
  authenticated?: boolean
  commentsDisabled?: boolean
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

  // Reset loaded comments when the sheet moves to a different post.
  const [prevPostId, setPrevPostId] = useState(postId)
  if (prevPostId !== postId) {
    setPrevPostId(postId)
    setComments(null)
    setCommentsPage(1)
    setCommentsMore(false)
    setDisabled(commentsDisabled)
  }

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      onCloseAction()
      setClosing(false)
    }, CLOSE_MS)
  }, [closing, onCloseAction])

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
    router.refresh()
  }, [load, router])

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
        className={`glass relative flex h-[70dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:h-[75dvh] sm:rounded-[28px] ${
          closing
            ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
            : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
        }`}
      >
        {/* iOS sheet drag handle (mobile) */}
        <div className="mx-auto mb-1 mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" />

        {/* Header: Cancel / title / spacer */}
        <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 pb-3 pt-1 sm:pt-3">
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

        {/* Scrollable comment list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
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

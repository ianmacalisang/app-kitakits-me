import { memo, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { getPost } from '@/actions/posts'
import {
  LIVE_EVENT,
  POST_DELETED,
  POST_UPDATED,
  type LiveEventDetail,
  type PostDeletedDetail,
  type PostUpdatedDetail,
} from '@/lib/events'
import type { PostCardData } from '@/lib/serialize'

import { EmptyState } from './EmptyState'
import { EyeOffIcon } from './icons'
import { PostCard } from './PostCard'
import { Spinner } from './Spinner'
import { useSheetDragClose } from './useSheetDrag'

const CLOSE_MS = 300

// Controlled post sheet — parent owns `open`; the post lazy-loads on first open.
export const PostSheet = memo(function PostSheet({
  postId,
  open,
  onCloseAction,
}: {
  postId: number
  open: boolean
  onCloseAction: () => void
}) {
  const [closing, setClosing] = useState(false)
  const [post, setPost] = useState<PostCardData | null>(null)
  const [missing, setMissing] = useState(false)

  // Reset the loaded post when the sheet moves to a different post.
  const [prevPostId, setPrevPostId] = useState(postId)
  if (prevPostId !== postId) {
    setPrevPostId(postId)
    setPost(null)
    setMissing(false)
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

  // Lazy-load on first open.
  useEffect(() => {
    if (!open || post !== null || missing) return
    let cancelled = false
    void getPost(postId).then((result) => {
      if (cancelled) return
      if (result) setPost(result)
      else setMissing(true)
    })
    return () => {
      cancelled = true
    }
  }, [open, post, missing, postId])

  // Keep the open post in sync — a delete anywhere flips the sheet to its
  // "no longer available" state, an edit patches the card in place.
  useEffect(() => {
    const onDeleted = (e: Event) => {
      if ((e as CustomEvent<PostDeletedDetail>).detail.postId === postId) setMissing(true)
    }
    const onUpdated = (e: Event) => {
      const updated = (e as CustomEvent<PostUpdatedDetail>).detail.post
      if (updated.id === postId) setPost(updated)
    }
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveEventDetail>).detail
      if (detail?.type === 'feed:delete' && detail.postId === postId) setMissing(true)
      else if (detail?.type === 'feed:update' && detail.postId === postId && post !== null) {
        void getPost(postId).then((result) => {
          if (result) setPost(result)
          else setMissing(true)
        })
      }
    }
    window.addEventListener(POST_DELETED, onDeleted)
    window.addEventListener(POST_UPDATED, onUpdated)
    window.addEventListener(LIVE_EVENT, onLive)
    return () => {
      window.removeEventListener(POST_DELETED, onDeleted)
      window.removeEventListener(POST_UPDATED, onUpdated)
      window.removeEventListener(LIVE_EVENT, onLive)
    }
  }, [postId, post])

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
        className={`glass relative flex h-dvh w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] sm:h-auto sm:max-h-[85vh] sm:rounded-[28px] ${
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
          <h2 className="text-[15px] font-semibold">Post</h2>
          <span className="w-14" />
        </div>

        {/* Scrollable post */}
        <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-none p-5">
          {post === null || missing ? (
            missing ? (
              <EmptyState
                plain
                icon={<EyeOffIcon />}
                title="This post is no longer available"
                message="It may have been deleted."
              />
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center">
                <Spinner />
              </div>
            )
          ) : (
            <PostCard post={post} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
})

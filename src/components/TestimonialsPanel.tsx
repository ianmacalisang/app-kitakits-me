'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import {
  createTestimonial,
  deleteTestimonial,
  getTestimonials,
  updateTestimonial,
} from '@/actions/testimonials'
import type { FormState } from '@/actions/auth'
import type { TestimonialData } from '@/lib/serialize'

import { AuthPrompt } from './AuthPrompt'
import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { EmptyState } from './EmptyState'
import { ComposeIcon, QuoteIcon, TrashIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { RelativeTime } from './RelativeTime'
import { TestimonialQuote } from './TestimonialQuote'

export function TestimonialForm({
  initial = '',
  submitLabel,
  onSubmitAction,
  onDoneAction,
}: {
  initial?: string
  submitLabel: string
  onSubmitAction: (content: string) => Promise<FormState>
  onDoneAction: () => void
}) {
  const [content, setContent] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    startTransition(async () => {
      const result = await onSubmitAction(content)
      if (result.error) {
        setError(result.error)
      } else {
        setContent('')
        setError(null)
        onDoneAction()
      }
    })
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          maxLength={1000}
          autoFocus
          placeholder="Say something nice…"
          className="w-full resize-none rounded-2xl border border-neutral-200/60 bg-white/60 p-3 text-[15px] leading-relaxed outline-none backdrop-blur-sm transition-all focus:border-accent-400 focus:bg-white/80 focus:ring-4 focus:ring-accent-500/10"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-400">
            They approve it before it shows on their profile.
          </p>
          <button
            type="submit"
            disabled={pending || !content.trim()}
            className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm"
          >
            {submitLabel}
          </button>
        </div>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

const STATUS_BADGE: Record<TestimonialData['status'], { label: string; className: string }> = {
  pending: {
    label: 'Awaiting approval',
    className: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',
  },
  approved: {
    label: 'Live on their profile',
    className: 'bg-accent-500/10 text-accent-700 ring-accent-500/20',
  },
  rejected: {
    label: 'Not approved',
    className: 'bg-black/5 text-neutral-500 ring-black/10',
  },
}

export function StatusBadge({ status }: { status: TestimonialData['status'] }) {
  const badge = STATUS_BADGE[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badge.className}`}
    >
      {badge.label}
    </span>
  )
}

// The Testimonials tab on a profile — approved testimonials plus the viewer's
// own (with its live status) and the write/edit form.
export function TestimonialsPanel({
  recipientId,
  recipientName,
  recipientUsername,
  testimonials: initialTestimonials,
  hasMore: initialHasMore,
  mine,
  canWrite,
  viewerAuthenticated,
  isSelf,
  pendingCount,
  isPublicPage,
}: {
  recipientId: number
  recipientName: string
  recipientUsername: string
  testimonials: TestimonialData[]
  hasMore: boolean
  mine: TestimonialData | null
  canWrite: boolean
  viewerAuthenticated: boolean
  isSelf: boolean
  pendingCount: number
  isPublicPage: boolean
}) {
  const router = useRouter()
  const [items, setItems] = useState(initialTestimonials)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [prevInitial, setPrevInitial] = useState(initialTestimonials)
  const [morePending, startMoreTransition] = useTransition()
  const [mutating, startMutation] = useTransition()
  const [authPrompt, setAuthPrompt] = useState(false)
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState(false)

  // Reconcile when the server re-renders the list (router.refresh()): keep
  // sentinel-loaded pages if the refreshed first page still matches.
  if (prevInitial !== initialTestimonials) {
    setPrevInitial(initialTestimonials)
    const sameHead =
      initialTestimonials.length > 0 &&
      items.length >= initialTestimonials.length &&
      initialTestimonials.every((t, i) => items[i].id === t.id)
    if (sameHead) {
      setItems([...initialTestimonials, ...items.slice(initialTestimonials.length)])
    } else {
      setItems(initialTestimonials)
      setPage(1)
      setHasMore(initialHasMore)
    }
  }

  const loadMore = () => {
    if (morePending) return
    startMoreTransition(async () => {
      const next = page + 1
      const result = await getTestimonials(recipientId, next)
      setItems((prev) => [...prev, ...result.items.filter((t) => !prev.some((p) => p.id === t.id))])
      setPage(next)
      setHasMore(result.hasMore)
    })
  }

  const profileHref = (username: string) =>
    isPublicPage ? `/@${username}` : `/profile/${username}`

  return (
    <div className="flex flex-col gap-4">
      {isSelf && pendingCount > 0 && (
        <Link
          href="/testimonials"
          className="glass flex items-center justify-between gap-3 rounded-2xl p-4 transition-colors hover:bg-white"
        >
          <span className="flex items-center gap-2.5 text-sm font-medium">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <QuoteIcon className="h-4 w-4" />
            </span>
            {pendingCount} testimonial{pendingCount === 1 ? '' : 's'} awaiting your review
          </span>
          <span className="text-xs font-semibold text-accent-700">Review</span>
        </Link>
      )}

      {mine && !isSelf && (
        <div className="glass rounded-3xl p-4 ring-1 ring-accent-500/20">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Your testimonial
            </p>
            <StatusBadge status={mine.status} />
          </div>
          {editing ? (
            <div className="mt-3">
              <TestimonialForm
                initial={mine.content}
                submitLabel="Resubmit"
                onSubmitAction={(content) => updateTestimonial(mine.id, content)}
                onDoneAction={() => {
                  setEditing(false)
                  router.refresh()
                }}
              />
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="mt-1 text-xs text-neutral-500 hover:text-neutral-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="mt-2.5">
                <TestimonialQuote content={mine.content} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-black/10"
                >
                  <ComposeIcon className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() =>
                    startMutation(async () => {
                      await deleteTestimonial(mine.id)
                      router.refresh()
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!isSelf && !mine && viewerAuthenticated && canWrite && (
        <div className="glass rounded-3xl p-4">
          {writing ? (
            <>
              <p className="mb-2 text-sm font-semibold">Write a testimonial for {recipientName}</p>
              <TestimonialForm
                submitLabel="Submit"
                onSubmitAction={(content) => createTestimonial(recipientId, content)}
                onDoneAction={() => {
                  setWriting(false)
                  router.refresh()
                }}
              />
              <button
                type="button"
                onClick={() => setWriting(false)}
                className="mt-1 text-xs text-neutral-500 hover:text-neutral-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setWriting(true)}
              className="flex w-full items-center gap-2.5 text-left"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500/10 text-accent-600">
                <ComposeIcon className="h-4 w-4" />
              </span>
              <span className="text-sm text-neutral-500">
                Write a testimonial for {recipientName}…
              </span>
            </button>
          )}
        </div>
      )}

      {!isSelf && !mine && !viewerAuthenticated && (
        <div className="glass rounded-3xl p-4">
          <button
            type="button"
            onClick={() => setAuthPrompt(true)}
            className="flex w-full items-center gap-2.5 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500/10 text-accent-600">
              <ComposeIcon className="h-4 w-4" />
            </span>
            <span className="text-sm text-neutral-500">
              Log in to write a testimonial for {recipientName}…
            </span>
          </button>
          <AuthPrompt open={authPrompt} onCloseAction={() => setAuthPrompt(false)} />
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<QuoteIcon />}
          title="No testimonials yet"
          message={
            isSelf
              ? 'Testimonials friends write for you will appear here once you approve them.'
              : viewerAuthenticated && canWrite
                ? `Be the first to write a testimonial for @${recipientUsername}.`
                : `@${recipientUsername} has no testimonials yet.`
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <li key={t.id} className="glass rounded-3xl p-4">
              <TestimonialQuote content={t.content} />
              <div className="mt-3.5 flex items-center gap-2.5">
                <Link href={profileHref(t.authorUsername)} className="shrink-0">
                  <Avatar src={t.authorAvatarUrl} name={t.authorName} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={profileHref(t.authorUsername)}
                    className="block truncate text-sm font-semibold hover:underline"
                  >
                    — {t.authorName} <BadgeMark badge={t.authorBadge} />
                  </Link>
                  <p className="truncate text-xs text-neutral-500">
                    @{t.authorUsername} · <RelativeTime iso={t.createdAt} />
                  </p>
                </div>
                {t.canModerate && !isPublicPage && (
                  <button
                    type="button"
                    aria-label="Remove testimonial"
                    disabled={mutating}
                    onClick={() =>
                      startMutation(async () => {
                        await deleteTestimonial(t.id)
                        router.refresh()
                      })
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <LoadSentinel hasMore={hasMore} pending={morePending} onLoadAction={loadMore} />
    </div>
  )
}

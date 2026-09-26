'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { FormState } from '@/actions/auth'
import {
  deleteTestimonial,
  getReceivedTestimonials,
  getWrittenTestimonials,
  setTestimonialStatus,
  updateTestimonial,
} from '@/actions/testimonials'
import type { Paged, TestimonialData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { CountBadge } from './CountBadge'
import { EmptyState } from './EmptyState'
import { CheckIcon, ComposeIcon, QuoteIcon, TrashIcon, XIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { StatusBadge, TestimonialForm } from './TestimonialsPanel'

type Tab = 'review' | 'profile' | 'written'

// Per-list pagination state with reconcile-on-refresh — server re-renders
// (router.refresh() after a mutation) swap in fresh first pages without
// dropping sentinel-loaded ones.
function useTestimonialList(
  initial: TestimonialData[],
  initialHasMore: boolean,
  loader: (page: number) => Promise<Paged<TestimonialData>>,
) {
  const [items, setItems] = useState(initial)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [prev, setPrev] = useState(initial)
  const [pending, startTransition] = useTransition()

  if (prev !== initial) {
    setPrev(initial)
    const sameHead =
      initial.length > 0 &&
      items.length >= initial.length &&
      initial.every((t, i) => items[i].id === t.id)
    if (sameHead) {
      setItems([...initial, ...items.slice(initial.length)])
    } else {
      setItems(initial)
      setPage(1)
      setHasMore(initialHasMore)
    }
  }

  const loadMore = () => {
    if (pending) return
    startTransition(async () => {
      const next = page + 1
      const result = await loader(next)
      setItems((prev) => [...prev, ...result.items.filter((t) => !prev.some((p) => p.id === t.id))])
      setPage(next)
      setHasMore(result.hasMore)
    })
  }

  return { items, hasMore, pending, loadMore }
}

const iconBtn =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50'

export function TestimonialsView({
  pending,
  pendingHasMore,
  received,
  receivedHasMore,
  written,
  writtenHasMore,
}: {
  pending: TestimonialData[]
  pendingHasMore: boolean
  received: TestimonialData[]
  receivedHasMore: boolean
  written: TestimonialData[]
  writtenHasMore: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('review')
  const [mutating, startMutation] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  const review = useTestimonialList(pending, pendingHasMore, (p) =>
    getReceivedTestimonials('pending', p),
  )
  const mine = useTestimonialList(received, receivedHasMore, (p) =>
    getReceivedTestimonials('resolved', p),
  )
  const mineWritten = useTestimonialList(written, writtenHasMore, getWrittenTestimonials)

  const run = (action: () => Promise<FormState>) => {
    startMutation(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
      } else {
        setError(null)
        setEditingId(null)
        router.refresh()
      }
    })
  }

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'review', label: 'Review', count: review.items.length },
    { value: 'profile', label: 'Approved' },
    { value: 'written', label: 'Mine' },
  ]

  return (
    <div>
      <div className="glass mb-4 flex rounded-full p-1">
        {tabs.map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex flex-1 items-center justify-center rounded-full py-1.5 text-sm font-medium transition-all ${
              tab === value
                ? 'bg-white/90 text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {label}
            <CountBadge count={count ?? 0} />
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {tab === 'review' &&
        (review.items.length === 0 ? (
          <EmptyState
            icon={<CheckIcon />}
            title="Nothing to review"
            message="When someone writes you a testimonial, it will show up here for your approval first."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {review.items.map((t) => (
              <li key={t.id} className="glass rounded-3xl p-4">
                <div className="flex items-center gap-2.5">
                  <Link href={`/profile/${t.authorUsername}`} className="shrink-0">
                    <Avatar src={t.authorAvatarUrl} name={t.authorName} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/profile/${t.authorUsername}`}
                      className="block truncate text-sm font-semibold hover:underline"
                    >
                      {t.authorName}
                    </Link>
                    <p className="truncate text-xs text-neutral-500">
                      @{t.authorUsername} · {formatRelativeTime(t.createdAt)}
                    </p>
                  </div>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                  {t.content}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={mutating}
                    onClick={() => run(() => setTestimonialStatus(t.id, 'approved'))}
                    className={`${iconBtn} bg-accent-500/10 text-accent-700 hover:bg-accent-500/20`}
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={mutating}
                    onClick={() => run(() => setTestimonialStatus(t.id, 'rejected'))}
                    className={`${iconBtn} bg-black/5 text-neutral-600 hover:bg-black/10`}
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'profile' &&
        (mine.items.length === 0 ? (
          <EmptyState
            icon={<QuoteIcon />}
            title="No testimonials yet"
            message="Testimonials you approve will be displayed on your profile."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {mine.items.map((t) => (
              <li key={t.id} className="glass rounded-3xl p-4">
                <div className="flex items-center gap-2.5">
                  <Link href={`/profile/${t.authorUsername}`} className="shrink-0">
                    <Avatar src={t.authorAvatarUrl} name={t.authorName} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/profile/${t.authorUsername}`}
                      className="block truncate text-sm font-semibold hover:underline"
                    >
                      {t.authorName}
                    </Link>
                    <p className="truncate text-xs text-neutral-500">
                      @{t.authorUsername} · {formatRelativeTime(t.createdAt)}
                    </p>
                  </div>
                  {t.status === 'rejected' && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 ring-1 ring-inset ring-black/10">
                      Declined
                    </span>
                  )}
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                  {t.content}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  {t.status === 'rejected' && (
                    <button
                      type="button"
                      disabled={mutating}
                      onClick={() => run(() => setTestimonialStatus(t.id, 'approved'))}
                      className={`${iconBtn} bg-accent-500/10 text-accent-700 hover:bg-accent-500/20`}
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={mutating}
                    onClick={() => run(() => deleteTestimonial(t.id))}
                    className={`${iconBtn} bg-black/5 text-red-500 hover:bg-red-500/10`}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'written' &&
        (mineWritten.items.length === 0 ? (
          <EmptyState
            icon={<ComposeIcon />}
            title="Nothing written yet"
            message="Visit someone's profile to write them a testimonial."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {mineWritten.items.map((t) => (
              <li key={t.id} className="glass rounded-3xl p-4">
                <div className="flex items-center gap-2.5">
                  <Link href={`/profile/${t.recipientUsername}`} className="shrink-0">
                    <Avatar src={t.recipientAvatarUrl} name={t.recipientName} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      For{' '}
                      <Link
                        href={`/profile/${t.recipientUsername}`}
                        className="font-semibold hover:underline"
                      >
                        {t.recipientName}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      @{t.recipientUsername} · {formatRelativeTime(t.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                {editingId === t.id ? (
                  <div className="mt-3">
                    <TestimonialForm
                      initial={t.content}
                      submitLabel="Resubmit"
                      onSubmitAction={(content) => updateTestimonial(t.id, content)}
                      onDoneAction={() => {
                        setEditingId(null)
                        router.refresh()
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="mt-1 text-xs text-neutral-500 hover:text-neutral-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                      {t.content}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(t.id)}
                        className={`${iconBtn} bg-black/5 text-neutral-600 hover:bg-black/10`}
                      >
                        <ComposeIcon className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={mutating}
                        onClick={() => run(() => deleteTestimonial(t.id))}
                        className={`${iconBtn} bg-black/5 text-red-500 hover:bg-red-500/10`}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ))}

      {tab === 'review' && (
        <LoadSentinel
          hasMore={review.hasMore}
          pending={review.pending}
          onLoadAction={review.loadMore}
        />
      )}
      {tab === 'profile' && (
        <LoadSentinel hasMore={mine.hasMore} pending={mine.pending} onLoadAction={mine.loadMore} />
      )}
      {tab === 'written' && (
        <LoadSentinel
          hasMore={mineWritten.hasMore}
          pending={mineWritten.pending}
          onLoadAction={mineWritten.loadMore}
        />
      )}
    </div>
  )
}

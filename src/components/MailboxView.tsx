'use client'

import { useRouter } from 'next/navigation'
import { memo, useCallback, useEffect, useRef, useState, useTransition } from 'react'

import {
  deleteDraft,
  getDrafts,
  getThreads,
  markAllThreadsRead,
  markThreadRead,
  searchMailThreads,
} from '@/actions/mail'
import { getNavBadgeCounts } from '@/actions/nav'
import type { DraftData, ThreadData } from '@/lib/serialize'
import { MAILBOX_TABS, type MailboxTab } from '@/lib/tabs'

import { Avatar } from './Avatar'
import { BadgeMark } from './BadgeMark'
import { ComposeMail } from './ComposeMail'
import { CountBadge } from './CountBadge'
import { EmptyState } from './EmptyState'
import { CheckIcon, ComposeIcon, MailboxIcon, SearchIcon, TrashIcon, XIcon } from './icons'
import { LoadSentinel } from './LoadSentinel'
import { RelativeTime } from './RelativeTime'
import { Spinner } from './Spinner'
import { useUrlTab } from './useUrlTab'

type Box = MailboxTab

const BOX_THUMB: Record<Box, string> = {
  inbox: 'translate-x-0',
  sent: 'translate-x-full',
  drafts: 'translate-x-[200%]',
}

// Threads the user has opened this session, keyed by the lastMessageAt they
// saw. Coming back from a thread can re-render this list from a stale Router
// Cache payload, so a server-reported `unread` is only trusted again once the
// timestamp moves past what was marked read — i.e. a genuinely new message.
const readMarkers = new Map<number, string | null>()

const applyReadMarkers = (list: ThreadData[]): ThreadData[] =>
  list.map((thread) => {
    if (!thread.unread) {
      readMarkers.delete(thread.id)
      return thread
    }
    if (readMarkers.has(thread.id) && readMarkers.get(thread.id) === thread.lastMessageAt) {
      return { ...thread, unread: false }
    }
    readMarkers.delete(thread.id)
    return thread
  })

export function MailboxView({
  threads,
  initialHasMore,
  drafts,
  composeTo,
  initialTab,
  sentItems,
  sentHasMore,
}: {
  threads: ThreadData[]
  initialHasMore: boolean
  drafts: DraftData[]
  composeTo: string | null
  initialTab?: Box
  // ?tab=sent lands with the sent first page already loaded server-side.
  sentItems?: ThreadData[]
  sentHasMore?: boolean
}) {
  const router = useRouter()
  // ?tab= persists Inbox / Sent / Drafts across refreshes and shares.
  const [box, selectBox] = useUrlTab<Box>(MAILBOX_TABS, 'inbox', initialTab)
  const [items, setItems] = useState(() =>
    applyReadMarkers(box === 'sent' && sentItems ? sentItems : threads),
  )
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(
    box === 'sent' && sentItems ? (sentHasMore ?? false) : initialHasMore,
  )
  const [draftItems, setDraftItems] = useState(drafts)
  const [pending, startTransition] = useTransition()
  const [morePending, startMoreTransition] = useTransition()
  // Tab-switch loading — shows a spinner in place of the list while the new
  // box's first page loads. requestedBox tracks the latest tab asked for so a
  // slow response from a superseded tab can't clobber the current one.
  const [switching, setSwitching] = useState(false)
  const requestedBox = useRef<Box>(box)
  const [prevInitial, setPrevInitial] = useState(threads)
  const [prevDrafts, setPrevDrafts] = useState(drafts)
  const [composeOpen, setComposeOpen] = useState(Boolean(composeTo))
  // The ?to= param prefills once; opening New mail manually starts blank.
  const [prefillTo, setPrefillTo] = useState(composeTo)
  // The draft being edited, and a session counter so every compose opens fresh.
  const [composeDraft, setComposeDraft] = useState<DraftData | null>(null)
  const [composeSession, setComposeSession] = useState(0)

  // Mail search — null means "not searching" and shows the normal tabs/list.
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ThreadData[] | null>(null)
  const [searching, startSearch] = useTransition()
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  // Inbox tab badge — the authoritative unread count, covering threads past
  // the loaded page. Refetched whenever server thread props refresh.
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  useEffect(() => {
    getNavBadgeCounts().then((counts) => {
      if (counts) setUnreadCount(counts.unreadMail)
    })
  }, [threads])

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [])

  const runSearch = (value: string) => {
    const q = value.trim()
    if (!q) {
      setSearchResults(null)
      return
    }
    const id = ++seq.current
    startSearch(async () => {
      const result = await searchMailThreads(q)
      if (id !== seq.current) return
      setSearchResults(applyReadMarkers(result))
    })
  }

  const handleQuery = (value: string) => {
    setQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(value), 300)
  }

  const clearSearch = () => {
    setQuery('')
    setSearchResults(null)
    if (searchTimer.current) clearTimeout(searchTimer.current)
  }

  // Navigating to /mailbox?to=x while already on the page re-opens compose.
  const [prevComposeTo, setPrevComposeTo] = useState(composeTo)
  if (prevComposeTo !== composeTo) {
    setPrevComposeTo(composeTo)
    if (composeTo) {
      setPrefillTo(composeTo)
      setComposeDraft(null)
      setComposeSession((s) => s + 1)
      setComposeOpen(true)
    }
  }

  // Server props refresh (router.refresh after a draft save/delete) replaces
  // the drafts list wholesale.
  if (prevDrafts !== drafts) {
    setPrevDrafts(drafts)
    setDraftItems(drafts)
  }

  // Reconcile when the server re-renders the inbox list (e.g. router.refresh()):
  // keep pages loaded via infinite scroll if the refreshed first page matches.
  if (box === 'inbox' && prevInitial !== threads) {
    setPrevInitial(threads)
    const normalized = applyReadMarkers(threads)
    const sameHead =
      normalized.length > 0 &&
      items.length >= normalized.length &&
      normalized.every((t, i) => items[i].id === t.id)
    if (sameHead) {
      setItems([...normalized, ...items.slice(normalized.length)])
    } else {
      setItems(normalized)
      setPage(1)
      setHasMore(initialHasMore)
    }
  }

  // If server props refresh while viewing Sent, refetch that box instead.
  const seenThreads = useRef(threads)
  useEffect(() => {
    if (seenThreads.current === threads) return
    seenThreads.current = threads
    if (box === 'sent') {
      startTransition(async () => {
        const result = await getThreads('sent', 1)
        setItems(applyReadMarkers(result.items))
        setPage(1)
        setHasMore(result.hasMore)
      })
    }
  }, [threads, box])

  // Loads a box's first page. Kept separate from the tab select so
  // URL-driven changes (below) can reuse it.
  const fetchBox = (next: Box) => {
    requestedBox.current = next
    setSwitching(true)
    if (next === 'drafts') {
      startTransition(async () => {
        try {
          setDraftItems(await getDrafts())
        } finally {
          if (requestedBox.current === next) setSwitching(false)
        }
      })
      return
    }
    startTransition(async () => {
      try {
        const result = await getThreads(next, 1)
        if (requestedBox.current !== next) return
        setItems(applyReadMarkers(result.items))
        setPage(1)
        setHasMore(result.hasMore)
      } finally {
        if (requestedBox.current === next) setSwitching(false)
      }
    })
  }

  const switchBox = (next: Box) => {
    if (next === box) return
    selectBox(next)
    fetchBox(next)
  }

  // Back/forward or a same-page ?tab= link changes box without switchBox —
  // fetch whichever box the URL now shows.
  useEffect(() => {
    if (requestedBox.current !== box) fetchBox(box)
  }, [box])

  const openCompose = (draft: DraftData | null) => {
    setPrefillTo(null)
    setComposeDraft(draft)
    setComposeSession((s) => s + 1)
    setComposeOpen(true)
  }

  const removeDraft = (draftId: number) => {
    setDraftItems((prev) => prev.filter((d) => d.id !== draftId))
    startTransition(async () => {
      await deleteDraft(draftId)
      router.refresh()
    })
  }

  const loadMore = useCallback(() => {
    if (morePending || box === 'drafts') return
    startMoreTransition(async () => {
      const next = page + 1
      const result = await getThreads(box, next)
      const fresh = applyReadMarkers(result.items)
      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.id))
        return [...prev, ...fresh.filter((t) => !seen.has(t.id))]
      })
      setPage(next)
      setHasMore(result.hasMore)
    })
  }, [morePending, page, box])

  const markAllRead = () => {
    const clearAll = (list: ThreadData[]) =>
      list.map((t) => {
        if (!t.unread) return t
        readMarkers.set(t.id, t.lastMessageAt)
        return { ...t, unread: false }
      })
    setItems(clearAll)
    setSearchResults((prev) => (prev ? clearAll(prev) : prev))
    setUnreadCount(0)
    startTransition(async () => {
      await markAllThreadsRead()
      router.refresh()
    })
  }

  const open = useCallback(
    (thread: ThreadData) => {
      if (thread.unread) {
        // Mark read now — waiting for the thread page's effect meant a quick
        // trip back could hit a cached list still showing the unread dot.
        readMarkers.set(thread.id, thread.lastMessageAt)
        const clearUnread = (list: ThreadData[]) =>
          list.map((t) => (t.id === thread.id ? { ...t, unread: false } : t))
        setItems(clearUnread)
        setSearchResults((prev) => (prev ? clearUnread(prev) : prev))
        setUnreadCount((c) => (c === null ? c : Math.max(0, c - 1)))
        void markThreadRead(thread.id)
      }
      router.push(`/mailbox/${thread.id}`)
    },
    [router],
  )

  const renderItem = (thread: ThreadData) => (
    <MailRow key={thread.id} thread={thread} box={box} onOpenAction={open} />
  )

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        {/* Search mail — replaces the page title */}
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') clearSearch()
            }}
            placeholder="Search mail…"
            aria-label="Search mail"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="glass-input rounded-full pl-11 pr-10"
          />
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
            {searching ? (
              <Spinner className="h-4 w-4 text-neutral-400" />
            ) : query ? (
              <button
                onClick={clearSearch}
                aria-label="Clear search"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-300/80 text-white transition-colors hover:bg-neutral-400"
              >
                <XIcon className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        </div>
        {(unreadCount ?? 0) > 0 && (
          <button
            onClick={markAllRead}
            disabled={pending}
            title="Mark all as read"
            aria-label="Mark all as read"
            className="btn-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-50"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => openCompose(null)}
          className="btn-primary flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm"
        >
          <ComposeIcon className="h-4 w-4" />
          <span className="hidden sm:inline">New mail</span>
        </button>
      </div>

      {searchResults !== null ? (
        /* Results replace the tabs + list while a query is active */
        searchResults.length === 0 ? (
          <EmptyState
            icon={<SearchIcon />}
            title="No mail found"
            message={`Nothing matches “${query.trim()}” in subjects, messages, or people.`}
          />
        ) : (
          <ul className={`flex flex-col gap-1 transition-opacity ${searching ? 'opacity-60' : ''}`}>
            {searchResults.map((thread) => (
              <MailRow key={thread.id} thread={thread} box="inbox" onOpenAction={open} />
            ))}
          </ul>
        )
      ) : (
        <>
          {/* Inbox / Sent / Drafts filter */}
          <div className="glass relative mb-3 flex rounded-full p-1">
            {/* Sliding gradient thumb — same pattern as HomeTabs */}
            <span
              aria-hidden
              className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-gradient-to-br from-accent-500 to-accent-600 shadow-md shadow-accent-600/30 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${BOX_THUMB[box]}`}
            />
            {(['inbox', 'sent', 'drafts'] as const).map((value) => (
              <button
                key={value}
                onClick={() => switchBox(value)}
                className={`relative z-10 flex flex-1 items-center justify-center rounded-full py-1.5 text-sm font-semibold capitalize transition-colors duration-300 ${
                  box === value ? 'text-white' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {value}
                {value === 'inbox' && (
                  <CountBadge count={unreadCount ?? 0} onAccent={box === value} />
                )}
                {value === 'drafts' && (
                  <CountBadge count={draftItems.length} onAccent={box === value} />
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {searchResults !== null ? null : switching ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : box === 'drafts' ? (
        draftItems.length === 0 ? (
          <EmptyState
            icon={<MailboxIcon />}
            title="No drafts"
            message="Unfinished mail saves itself when you close the composer."
          />
        ) : (
          <ul className={`flex flex-col gap-1 transition-opacity ${pending ? 'opacity-60' : ''}`}>
            {draftItems.map((draft) => (
              <DraftRow
                key={draft.id}
                draft={draft}
                onOpenAction={openCompose}
                onDeleteAction={removeDraft}
              />
            ))}
          </ul>
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MailboxIcon />}
          title={box === 'sent' ? 'Nothing sent yet' : 'No mail yet'}
          message={
            box === 'sent'
              ? 'Mail you send will show up here.'
              : 'Write someone a letter — tap New mail to get started.'
          }
        />
      ) : (
        <ul className={`flex flex-col gap-1 transition-opacity ${pending ? 'opacity-60' : ''}`}>
          {items.map(renderItem)}
        </ul>
      )}

      <LoadSentinel
        hasMore={!switching && searchResults === null && box !== 'drafts' && hasMore}
        pending={morePending}
        onLoadAction={loadMore}
      />

      <ComposeMail
        key={composeDraft ? `draft-${composeDraft.id}` : `new-${composeSession}`}
        open={composeOpen}
        initialTo={prefillTo}
        draft={composeDraft}
        onCloseAction={() => setComposeOpen(false)}
      />
    </div>
  )
}

const MailRow = memo(function MailRow({
  thread,
  box,
  onOpenAction,
}: {
  thread: ThreadData
  box: Box
  onOpenAction: (thread: ThreadData) => void
}) {
  return (
    <li>
      <button
        onClick={() => onOpenAction(thread)}
        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
          thread.unread
            ? 'glass border-accent-500/25 hover:bg-white'
            : 'border-transparent hover:bg-white/60'
        }`}
      >
        {/* Unread dot rides the avatar corner — same pattern as the type
            badge on notification rows. */}
        <span className="relative shrink-0">
          <Avatar src={thread.otherAvatarUrl} name={thread.otherName} />
          {thread.unread && (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent-500 ring-2 ring-white/80" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={`truncate text-sm ${thread.unread ? 'font-bold' : 'font-semibold'}`}>
                {box === 'sent' ? `To: ${thread.otherName}` : thread.otherName}
              </span>
              <BadgeMark badge={thread.otherBadge} />
              {thread.isGuest && (
                <span className="shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 ring-1 ring-inset ring-black/10">
                  Guest
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {thread.messageCount > 1 && (
                <span
                  title={`${thread.messageCount} messages`}
                  className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-500"
                >
                  {thread.messageCount}
                </span>
              )}
              <span
                className={`text-xs ${
                  thread.unread ? 'font-semibold text-accent-600' : 'text-neutral-500'
                }`}
              >
                {thread.lastMessageAt ? <RelativeTime iso={thread.lastMessageAt} /> : ''}
              </span>
            </span>
          </span>
          <span
            className={`block truncate text-sm ${
              thread.unread ? 'font-semibold text-neutral-900' : 'text-neutral-700'
            }`}
          >
            {thread.subject}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {thread.sentByMe ? 'You: ' : ''}
            {thread.snippet}
          </span>
        </span>
      </button>
    </li>
  )
})

const DraftRow = memo(function DraftRow({
  draft,
  onOpenAction,
  onDeleteAction,
}: {
  draft: DraftData
  onOpenAction: (draft: DraftData) => void
  onDeleteAction: (draftId: number) => void
}) {
  const toLabel = draft.recipient ? (
    <>
      To: {draft.recipient.name}
      <BadgeMark badge={draft.recipient.badge} />
    </>
  ) : draft.to ? (
    `To: @${draft.to}`
  ) : (
    'No recipient'
  )

  return (
    <li className="flex items-center gap-1 rounded-2xl border border-transparent transition-all hover:bg-white/60">
      <button
        onClick={() => onOpenAction(draft)}
        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
      >
        {draft.recipient ? (
          <Avatar src={draft.recipient.avatarUrl} name={draft.recipient.name} />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-accent-500">
            <ComposeIcon className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold">{toLabel}</span>
            <span className="shrink-0 text-xs text-neutral-500">
              <RelativeTime iso={draft.updatedAt} />
            </span>
          </span>
          <span className="block truncate text-sm text-neutral-700">
            {draft.subject || '(no subject)'}
          </span>
          <span
            className={`block truncate text-xs text-neutral-500 ${draft.snippet ? '' : 'italic'}`}
          >
            {draft.snippet ?? 'Empty draft'}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label="Delete draft"
        title="Delete draft"
        onClick={() => onDeleteAction(draft.id)}
        className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  )
})

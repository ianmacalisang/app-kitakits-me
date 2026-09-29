'use client'

import { memo } from 'react'

import type { QueueItemData } from '@/lib/videoke'

import { Avatar } from '../Avatar'
import { ChevronDownIcon, ChevronUpIcon, MusicIcon, XIcon } from '../icons'
import { EqBars } from './EqBars'
import { fmtDuration } from './SongSearch'

// The room's shared queue — the playing row is rendered by the room itself;
// this lists queued songs (with host reorder + adder/host removal) and a
// collapsed history of done/skipped rows at the bottom.
export const QueueList = memo(function QueueList({
  queue,
  meId,
  isHost,
  canMutate,
  onRemove,
  onMove,
}: {
  queue: QueueItemData[]
  meId: number
  isHost: boolean
  canMutate: boolean
  onRemove: (item: QueueItemData) => void
  onMove: (itemId: number, dir: -1 | 1) => void
}) {
  const queued = queue.filter((q) => q.state === 'queued').sort((a, b) => a.position - b.position)
  const history = queue.filter((q) => q.state === 'done' || q.state === 'skipped')

  return (
    <div>
      {queued.length === 0 ? (
        <p className="px-1 text-sm text-neutral-500">Queue is empty — search above to add songs.</p>
      ) : (
        <ul className="glass divide-y divide-neutral-200/60 overflow-hidden rounded-2xl dark:divide-white/10">
          {queued.map((item, i) => {
            const canRemove = canMutate && (item.addedBy?.id === meId || isHost)
            const upNext = i === 0
            return (
              <li
                key={item.id}
                className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                  upNext
                    ? 'bg-accent-500/[0.07]'
                    : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
                }`}
              >
                {upNext ? (
                  <EqBars className="h-4 w-5 shrink-0 text-accent-500" playing />
                ) : (
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-neutral-400">
                    {i + 1}
                  </span>
                )}
                <span className="relative shrink-0">
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="h-10 w-16 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-16 items-center justify-center rounded-lg bg-black/10 text-neutral-400 dark:bg-white/10">
                      <MusicIcon className="h-4 w-4" />
                    </span>
                  )}
                  {item.durationSec != null && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 py-px text-[9px] font-semibold leading-none text-white">
                      {fmtDuration(item.durationSec)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {upNext && (
                      <span className="mr-1.5 rounded bg-accent-500/10 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-accent-600">
                        Up next
                      </span>
                    )}
                    {item.title}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                    {item.addedBy && (
                      <>
                        <Avatar src={item.addedBy.avatarUrl} name={item.addedBy.name} size="xs" />
                        <span className="truncate">{item.addedBy.name}</span>
                      </>
                    )}
                  </span>
                </span>
                {isHost && canMutate && (
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => onMove(item.id, -1)}
                      className="p-0.5 text-neutral-400 transition hover:text-accent-600 disabled:opacity-30"
                    >
                      <ChevronUpIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === queued.length - 1}
                      onClick={() => onMove(item.id, 1)}
                      className="p-0.5 text-neutral-400 transition hover:text-accent-600 disabled:opacity-30"
                    >
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                {canRemove && (
                  <button
                    type="button"
                    aria-label={`Remove ${item.title}`}
                    onClick={() => onRemove(item)}
                    className="shrink-0 rounded-full p-1.5 text-neutral-400 transition hover:bg-red-500/10 hover:text-red-500"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {history.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer px-1 text-xs font-semibold text-neutral-400">
            History ({history.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {history.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 px-1 py-0.5 text-xs text-neutral-400"
              >
                <span className="truncate">{item.title}</span>
                <span className="shrink-0">
                  {item.state === 'skipped' ? '· skipped' : '· done'}
                </span>
                {item.addedBy && <span className="shrink-0">· {item.addedBy.name}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
})

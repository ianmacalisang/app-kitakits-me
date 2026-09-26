import Link from 'next/link'
import { memo, useState, useTransition } from 'react'

import { deleteComment, updateComment } from '@/actions/comments'
import type { CommentData } from '@/lib/serialize'
import { formatRelativeTime } from '@/lib/time'

import { Avatar } from './Avatar'
import { EmptyState } from './EmptyState'
import { CommentIcon } from './icons'

export function CommentList({
  comments,
  onChangedAction,
  className = '',
}: {
  comments: CommentData[]
  onChangedAction: () => void
  className?: string
}) {
  return (
    <ul className={`flex flex-col divide-y divide-black/5 ${className}`}>
      {comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} onChangedAction={onChangedAction} />
      ))}
      {comments.length === 0 && (
        <li>
          <EmptyState
            plain
            compact
            icon={<CommentIcon />}
            title="No comments yet"
            message="Be the first to comment."
          />
        </li>
      )}
    </ul>
  )
}

const CommentItem = memo(function CommentItem({
  comment,
  onChangedAction,
}: {
  comment: CommentData
  onChangedAction: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.content)
  const [pending, startTransition] = useTransition()

  const save = () => {
    startTransition(async () => {
      const result = await updateComment(comment.id, draft)
      if (!result.error) {
        setEditing(false)
        onChangedAction()
      }
    })
  }

  const remove = () => {
    startTransition(async () => {
      const result = await deleteComment(comment.id)
      if (!result.error) onChangedAction()
    })
  }

  return (
    <li className="flex gap-3 py-3">
      <Link href={`/profile/${comment.authorUsername}`}>
        <Avatar src={comment.authorAvatarUrl} name={comment.authorName} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-neutral-500">
          <Link
            href={`/profile/${comment.authorUsername}`}
            className="font-semibold text-neutral-900 hover:underline"
          >
            {comment.authorName}
          </Link>{' '}
          · {formatRelativeTime(comment.createdAt)}
        </p>
        {editing ? (
          <div className="mt-1 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              className="w-full rounded-xl border border-neutral-200/60 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-accent-400 focus:ring-4 focus:ring-accent-500/10"
            />
            <button
              onClick={save}
              disabled={pending || !draft.trim()}
              className="text-sm font-medium text-neutral-900 hover:underline disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setDraft(comment.content)
              }}
              className="text-sm text-neutral-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{comment.content}</p>
        )}
        {comment.canEdit && !editing && (
          <div className="mt-1 flex gap-3 text-xs text-neutral-500">
            <button onClick={() => setEditing(true)} className="hover:text-neutral-900">
              Edit
            </button>
            <button
              onClick={remove}
              disabled={pending}
              className="hover:text-red-600 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  )
})

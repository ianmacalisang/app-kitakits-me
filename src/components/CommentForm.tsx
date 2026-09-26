import { useState, useTransition } from 'react'

import { createComment } from '@/actions/comments'

export function CommentForm({
  postId,
  onSubmittedAction,
  className = '',
}: {
  postId: number
  onSubmittedAction: () => void
  className?: string
}) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    startTransition(async () => {
      const result = await createComment(postId, content)
      if (result.error) {
        setError(result.error)
      } else {
        setContent('')
        setError(null)
        onSubmittedAction()
      }
    })
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a comment…"
          maxLength={1000}
          className="w-full rounded-full border border-neutral-200/60 bg-white/60 px-4 py-2 text-sm outline-none backdrop-blur-sm transition-all placeholder:text-neutral-400 focus:border-accent-400 focus:bg-white/80 focus:ring-4 focus:ring-accent-500/10"
        />
        <button
          type="submit"
          disabled={pending || !content.trim()}
          className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm"
        >
          Post
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { deleteThread, markThreadRead, replyToThread } from '@/actions/mail'
import {
  MAIL_ATTACHMENT_ACCEPT,
  MAIL_ATTACHMENT_MAX_BYTES,
  MAIL_ATTACHMENT_MAX_FILES,
  isMailAttachmentType,
} from '@/lib/mail-attachments'
import type { MailMessageData, ThreadData } from '@/lib/serialize'
import { formatMailDate } from '@/lib/time'

import { Avatar } from './Avatar'
import { ChevronLeftIcon, PaperclipIcon, ReplyIcon, SendIcon, TrashIcon, XIcon } from './icons'
import { MailEditor } from './MailEditor'

// Rich-text mail bodies are HTML; pre-WYSIWYG letters are plain text.
const isHtml = (body: string) => /<\/?[a-z][\s\S]*>/i.test(body)
const bodyIsEmpty = (html: string) => html.replace(/<[^>]+>/g, '').trim() === ''

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MailThreadView({
  thread,
  messages,
  viewerName,
  viewerAvatarUrl,
}: {
  thread: ThreadData
  messages: MailMessageData[]
  viewerName: string
  viewerAvatarUrl?: string
}) {
  const router = useRouter()
  const [replyHtml, setReplyHtml] = useState('')
  const [replyKey, setReplyKey] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [deleting, startDelete] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCount = useRef(messages.length)

  // Opening the thread marks the whole conversation read (Gmail-style).
  useEffect(() => {
    if (!thread.unread) return
    void markThreadRead(thread.id).then(() => router.refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id])

  // Scroll to the newest message when one lands.
  useEffect(() => {
    if (messages.length > prevCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevCount.current = messages.length
  }, [messages.length])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    for (const file of Array.from(list)) {
      if (next.length >= MAIL_ATTACHMENT_MAX_FILES) {
        setError(`Attach at most ${MAIL_ATTACHMENT_MAX_FILES} files.`)
        break
      }
      if (!isMailAttachmentType(file.type)) {
        setError('Attachments can be images, PDFs, or plain text files.')
        continue
      }
      if (file.size > MAIL_ATTACHMENT_MAX_BYTES) {
        setError('Each attachment must be 5 MB or smaller.')
        continue
      }
      next.push(file)
    }
    setFiles(next)
  }

  const send = () => {
    startTransition(async () => {
      const formData = new FormData()
      for (const file of files) formData.append('attachment', file)
      const result = await replyToThread(thread.id, replyHtml, formData)
      if (result.error) {
        setError(result.error)
      } else {
        setReplyHtml('')
        setReplyKey((k) => k + 1)
        setFiles([])
        setError(null)
        router.refresh()
      }
    })
  }

  const remove = () => {
    startDelete(async () => {
      await deleteThread(thread.id)
      router.push('/mailbox')
      router.refresh()
    })
  }

  return (
    <div>
      {/* Header: back / subject / delete */}
      <div className="mb-1 flex items-center gap-2">
        <Link
          href="/mailbox"
          aria-label="Back to mailbox"
          title="Back to mailbox"
          className="btn-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{thread.subject}</h1>
        <button
          onClick={remove}
          disabled={deleting}
          aria-label="Delete thread"
          title="Delete thread"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
      <p className="mb-4 ml-11 text-sm text-neutral-500">
        with {thread.otherName}
        {thread.isGuest
          ? `${thread.guestContact ? ` · ${thread.guestContact}` : ''} · Guest`
          : ` · @${thread.otherUsername}`}
      </p>

      {/* Messages — email cards, oldest first */}
      <ol className="flex flex-col gap-4">
        {messages.map((m) => (
          <li key={m.id} className="glass rounded-3xl p-5">
            <div className="flex items-start gap-3">
              <Avatar src={m.senderAvatarUrl} name={m.senderName} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {m.isMine ? 'You' : m.senderName}{' '}
                    {m.senderUsername ? (
                      <span className="font-normal text-neutral-500">@{m.senderUsername}</span>
                    ) : m.senderContact ? (
                      <span className="font-normal text-neutral-500">
                        {m.senderContact} · Guest
                      </span>
                    ) : null}
                  </p>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {formatMailDate(m.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">to {m.isMine ? thread.otherName : 'me'}</p>
              </div>
            </div>
            {isHtml(m.body) ? (
              // Sanitized server-side on write — safe to render as HTML.
              <div
                className="mail-richtext mt-3 text-[15px] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: m.body }}
              />
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{m.body}</p>
            )}
            {m.attachments.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {m.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-2xl border border-black/5 bg-white/60 px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-white"
                    >
                      {a.mimeType?.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.url}
                          alt={a.filename}
                          className="h-8 w-8 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <PaperclipIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                      )}
                      <span className="max-w-48 truncate">{a.filename}</span>
                      {a.filesize != null && (
                        <span className="shrink-0 text-neutral-400">
                          {formatFileSize(a.filesize)}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {/* Guest senders have no account to reply to — point at their contact
          info instead of a dead-end composer. */}
      {thread.isGuest ? (
        <div className="glass mt-4 rounded-3xl p-5">
          <p className="text-sm text-neutral-500">
            {thread.otherName} sent this as a guest and can&apos;t see replies here.
            {thread.guestContact ? ` Reach them at ${thread.guestContact}.` : ''}
          </p>
        </div>
      ) : (
        /* Reply — styled like an email reply block, not a chat bar */
        <div className="glass mt-4 rounded-3xl p-5">
          <div className="flex items-center gap-2.5 border-b border-black/5 pb-3">
            <ReplyIcon className="h-4 w-4 shrink-0 text-neutral-400" />
            <p className="truncate text-sm text-neutral-500">
              To <span className="font-semibold text-neutral-700">{thread.otherName}</span>{' '}
              <span>@{thread.otherUsername}</span>
            </p>
          </div>
          <div className="flex gap-3 pt-3">
            <Avatar src={viewerAvatarUrl} name={viewerName} />
            <div className="min-w-0 flex-1">
              <MailEditor
                key={replyKey}
                onChangeAction={setReplyHtml}
                placeholder="Write your reply…"
                minHeight={100}
              />
            </div>
          </div>
          {files.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-emerald-800"
                >
                  <PaperclipIcon className="h-3 w-3 shrink-0" />
                  <span className="max-w-40 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="rounded-full p-0.5 text-emerald-700/70 transition-colors hover:bg-emerald-500/20 hover:text-emerald-900"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              title="Attach files"
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-600"
            >
              <PaperclipIcon className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={MAIL_ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              onClick={send}
              disabled={pending || bodyIsEmpty(replyHtml)}
              className="btn-primary flex items-center gap-2 rounded-full px-4 py-1.5 text-sm"
            >
              <SendIcon className="h-4 w-4" />
              {pending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

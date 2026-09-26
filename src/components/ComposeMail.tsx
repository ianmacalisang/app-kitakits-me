'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import {
  deleteDraft,
  type MailRecipient,
  saveDraft,
  searchMailRecipients,
  sendMail,
} from '@/actions/mail'
import {
  MAIL_ATTACHMENT_ACCEPT,
  MAIL_ATTACHMENT_MAX_BYTES,
  MAIL_ATTACHMENT_MAX_FILES,
  isMailAttachmentType,
} from '@/lib/mail-attachments'
import type { DraftData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { MailEditor } from './MailEditor'
import { PaperclipIcon, SendIcon, TrashIcon, UsersIcon, XIcon } from './icons'
import { Spinner } from './Spinner'

const bodyIsEmpty = (html: string) => html.replace(/<[^>]+>/g, '').trim() === ''

const CLOSE_MS = 300

// Controlled compose sheet — an email-style "To / Subject / Body" letter form.
// `draft` restores a saved draft; the parent remounts the sheet per draft via
// React `key`, so these initializers only run once per compose session.
export function ComposeMail({
  open,
  onCloseAction,
  initialTo,
  draft = null,
}: {
  open: boolean
  onCloseAction: () => void
  initialTo: string | null
  draft?: DraftData | null
}) {
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [bodyHtml, setBodyHtml] = useState(draft?.body ?? '')
  const [to, setTo] = useState(draft ? draft.to : (initialTo ?? ''))
  const [recipient, setRecipient] = useState<MailRecipient | null>(draft?.recipient ?? null)
  const [subject, setSubject] = useState(draft?.subject ?? '')
  const [draftId, setDraftId] = useState<number | null>(draft?.id ?? null)
  const [saving, setSaving] = useState(false)
  const discarded = useRef(false)
  const [prevInitialTo, setPrevInitialTo] = useState(initialTo)
  const [results, setResults] = useState<MailRecipient[]>([])
  const [dropOpen, setDropOpen] = useState(false)
  const [searching, startSearch] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])

  // A different prefill target readdresses the draft — and detaches from any
  // loaded draft so saving can't overwrite it.
  if (prevInitialTo !== initialTo) {
    setPrevInitialTo(initialTo)
    setTo(initialTo ?? '')
    setRecipient(null)
    setDraftId(null)
    setResults([])
    setDropOpen(false)
  }

  const hasContent = Boolean(recipient || to.trim() || subject.trim() || !bodyIsEmpty(bodyHtml))

  const saveNow = useCallback(async () => {
    if (!hasContent) return
    setSaving(true)
    const result = await saveDraft({
      draftId,
      to,
      recipientId: recipient?.id ?? null,
      subject,
      body: bodyHtml,
    })
    setSaving(false)
    if (result.draftId) {
      setDraftId(result.draftId)
      router.refresh()
    }
  }, [hasContent, draftId, to, recipient, subject, bodyHtml, router])

  // Closing a non-empty draft auto-saves it — Gmail semantics. The trash
  // button is the explicit discard path.
  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    if (!discarded.current && hasContent) void saveNow()
    setTimeout(() => {
      onCloseAction()
      setClosing(false)
    }, CLOSE_MS)
  }, [closing, onCloseAction, hasContent, saveNow])

  const discard = () => {
    discarded.current = true
    const id = draftId
    if (id) {
      void deleteDraft(id).then(() => router.refresh())
    }
    close()
  }

  // Lock scroll and support Escape while the sheet is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dropOpen) {
        setDropOpen(false)
        return
      }
      close()
    }
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
      document.body.style.overflow = ''
    }
  }, [open, close, dropOpen])

  const handleToChange = (next: string) => {
    setTo(next)
    if (timer.current) clearTimeout(timer.current)
    const q = next.trim().replace(/^@/, '')
    if (!q) {
      setResults([])
      setDropOpen(false)
      return
    }
    timer.current = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchMailRecipients(q))
        setDropOpen(true)
      })
    }, 300)
  }

  const pick = (user: MailRecipient) => {
    setRecipient(user)
    setTo('')
    setResults([])
    setDropOpen(false)
    subjectRef.current?.focus()
  }

  const removeRecipient = () => {
    setRecipient(null)
    requestAnimationFrame(() => toRef.current?.focus())
  }

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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('body', bodyHtml)
    if (draftId) formData.set('draftId', String(draftId))
    for (const file of files) formData.append('attachment', file)
    startTransition(async () => {
      const result = await sendMail({}, formData)
      if (result.error) {
        setError(result.error)
      } else if (result.threadId) {
        setError(null)
        setRecipient(null)
        setTo('')
        setSubject('')
        setDraftId(null)
        setFiles([])
        router.push(`/mailbox/${result.threadId}`)
      }
    })
  }

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
        className={`glass relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-[28px] px-5 pb-5 pt-2 sm:rounded-[28px] sm:pt-4 ${
          closing
            ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
            : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
        }`}
      >
        {/* iOS sheet drag handle (mobile) */}
        <div className="mx-auto mb-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" />

        <form onSubmit={handleSubmit}>
          {/* Header: Close (auto-saves) / title / Send */}
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <button
              type="button"
              onClick={close}
              className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800"
            >
              Close
            </button>
            <h2 className="text-[15px] font-semibold">New Mail</h2>
            <button
              type="submit"
              disabled={
                pending || !(recipient || to.trim()) || !subject.trim() || bodyIsEmpty(bodyHtml)
              }
              className="btn-primary flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm"
            >
              {pending ? <Spinner className="h-3.5 w-3.5" /> : <SendIcon className="h-3.5 w-3.5" />}
              {pending ? 'Sending…' : 'Send'}
            </button>
          </div>

          {/* To — recipient chip or username input with autocomplete */}
          <div ref={boxRef} className="relative border-b border-black/5">
            <div className="flex items-center gap-3">
              <span className="w-14 shrink-0 py-2.5 text-sm text-neutral-500">To</span>
              {recipient ? (
                <>
                  <input type="hidden" name="to" value={recipient.username} />
                  <span className="my-1.5 flex min-w-0 items-center gap-1.5 rounded-full bg-accent-500/10 py-1 pl-1 pr-1.5 text-sm font-medium text-accent-800">
                    <Avatar src={recipient.avatarUrl} name={recipient.name} size="xs" />
                    <span className="max-w-36 truncate">@{recipient.username}</span>
                    <button
                      type="button"
                      aria-label="Remove recipient"
                      onClick={removeRecipient}
                      className="rounded-full p-0.5 text-accent-700/70 transition-colors hover:bg-accent-500/20 hover:text-accent-900"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                </>
              ) : (
                <input
                  ref={toRef}
                  name="to"
                  value={to}
                  onChange={(e) => handleToChange(e.target.value)}
                  onFocus={() => {
                    if (to.trim() && results.length) setDropOpen(true)
                  }}
                  placeholder="username"
                  autoComplete="off"
                  autoFocus
                  required
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-neutral-400"
                />
              )}
              {searching && <Spinner className="h-4 w-4 shrink-0 text-neutral-400" />}
            </div>
            {dropOpen && (
              <div className="glass absolute inset-x-0 top-full z-20 mt-1 rounded-2xl p-1.5">
                {results.length === 0 ? (
                  <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-500">
                    <UsersIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                    No users match &ldquo;{to.trim().replace(/^@/, '')}&rdquo;
                  </div>
                ) : (
                  results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => pick(u)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/70"
                    >
                      <Avatar src={u.avatarUrl} name={u.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold leading-tight">
                          {u.name}
                        </span>
                        <span className="block truncate text-xs leading-tight text-neutral-500">
                          @{u.username}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Subject */}
          <div className="flex items-center gap-3 border-b border-black/5">
            <span className="w-14 shrink-0 py-2.5 text-sm text-neutral-500">Subject</span>
            <input
              ref={subjectRef}
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={150}
              autoComplete="off"
              placeholder="What's this about?"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-medium outline-none placeholder:text-neutral-400"
            />
            {subject.length > 0 && (
              <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                {subject.length}/150
              </span>
            )}
          </div>

          {/* Body — WYSIWYG */}
          <MailEditor
            onChangeAction={setBodyHtml}
            initialContent={draft?.body ?? ''}
            minHeight={200}
          />

          {/* Picked attachments — uploaded on send, not stored in drafts */}
          {files.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-1.5 rounded-full bg-accent-500/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-accent-800"
                >
                  <PaperclipIcon className="h-3 w-3 shrink-0" />
                  <span className="max-w-40 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="rounded-full p-0.5 text-accent-700/70 transition-colors hover:bg-accent-500/20 hover:text-accent-900"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Footer: discard / attach / draft status / save */}
          <div className="flex items-center justify-between border-t border-black/5 pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={discard}
                aria-label="Discard draft"
                title="Discard draft"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
                title="Attach files"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-accent-500/10 hover:text-accent-600"
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
            </div>
            <button
              type="button"
              onClick={() => void saveNow()}
              disabled={!hasContent || saving}
              className="text-sm font-medium text-accent-600 transition-colors hover:text-accent-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : draftId ? 'Draft saved' : 'Save draft'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

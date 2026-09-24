'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { sendGuestMail, sendMail } from '@/actions/mail'

import { MailboxIcon, MailIcon, SendIcon } from './icons'
import { MailEditor } from './MailEditor'
import { Spinner } from './Spinner'

const CLOSE_MS = 300
const bodyIsEmpty = (html: string) => html.replace(/<[^>]+>/g, '').trim() === ''

// Floating mail button for public profiles. Signed-in visitors get the normal
// composer; guests also supply a name + contact so the recipient can reply.
export function PublicMailButton({
  username,
  recipientName,
  isLoggedIn,
  variant = 'floating',
}: {
  username: string
  recipientName: string
  isLoggedIn: boolean
  variant?: 'floating' | 'inline'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const [senderName, setSenderName] = useState('')
  const [senderContact, setSenderContact] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
      setSent(false)
      setError(null)
    }, CLOSE_MS)
  }, [closing])

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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData()
    formData.set('to', username)
    formData.set('subject', subject)
    formData.set('body', bodyHtml)
    if (!isLoggedIn) {
      formData.set('senderName', senderName)
      formData.set('senderContact', senderContact)
    }
    startTransition(async () => {
      const result = isLoggedIn ? await sendMail({}, formData) : await sendGuestMail({}, formData)
      if (result.error) {
        setError(result.error)
      } else if (result.threadId) {
        router.push(`/mailbox/${result.threadId}`)
      } else {
        setError(null)
        setSent(true)
      }
    })
  }

  const canSend =
    Boolean(subject.trim()) &&
    !bodyIsEmpty(bodyHtml) &&
    (isLoggedIn || (Boolean(senderName.trim()) && Boolean(senderContact.trim())))

  return (
    <>
      {variant === 'inline' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-primary mb-0.5 flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 pl-3.5 text-sm font-semibold shadow-md shadow-emerald-900/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.98]"
        >
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
            {/* Sonar ripple — same pulse as the floating mail button */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full ring-2 ring-white/60 opacity-0 motion-safe:animate-mail-ring"
            />
            <MailIcon className="h-3.5 w-3.5" />
          </span>
          Get in Touch
        </button>
      ) : (
        /* Floating pill at the same margins as the app's bottom nav dock —
           gradient CTA with the frosted mailbox chip + sonar ring used on the
           in-app mail button. */
        <div className="pointer-events-none fixed inset-x-4 bottom-5 z-30 mx-auto flex max-w-3xl justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Send ${recipientName} an email`}
            className="btn-primary group/mail pointer-events-auto flex items-center justify-center gap-2.5 rounded-full py-2.5 pl-3 pr-5 text-[15px] font-semibold shadow-xl shadow-emerald-900/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0 active:scale-[0.98]"
          >
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
              {/* Ambient sonar ring — slow ripple to draw the eye */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-full ring-2 ring-white/60 opacity-0 motion-safe:animate-mail-ring"
              />
              <MailboxIcon className="h-5 w-5 drop-shadow-sm transition-transform duration-300 group-hover/mail:-rotate-6 group-hover/mail:scale-110" />
            </span>
            Get in Touch
          </button>
        </div>
      )}

      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
            <div
              className={`absolute inset-0 bg-emerald-950/40 backdrop-blur-sm ${
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

              {sent ? (
                <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <MailboxIcon className="h-7 w-7" />
                  </span>
                  <p className="text-sm font-semibold text-neutral-700">Mail sent</p>
                  <p className="text-xs leading-relaxed text-neutral-500">
                    {recipientName} will see your letter in their mailbox.
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="btn-primary mt-2 rounded-full px-5 py-1.5 text-sm"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {/* Header: Close / title / Send */}
                  <div className="flex items-center justify-between border-b border-black/5 pb-3">
                    <button
                      type="button"
                      onClick={close}
                      className="w-14 text-left text-[15px] text-neutral-500 transition-colors hover:text-neutral-800"
                    >
                      Close
                    </button>
                    <h2 className="text-[15px] font-semibold">Mail {recipientName}</h2>
                    <button
                      type="submit"
                      disabled={pending || !canSend}
                      className="btn-primary flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm disabled:opacity-50"
                    >
                      {pending ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <SendIcon className="h-3.5 w-3.5" />
                      )}
                      {pending ? 'Sending…' : 'Send'}
                    </button>
                  </div>

                  {/* To — fixed to the profile owner */}
                  <div className="flex items-center gap-3 border-b border-black/5">
                    <span className="w-14 shrink-0 py-2.5 text-sm text-neutral-500">To</span>
                    <span className="my-1.5 flex min-w-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-800">
                      @{username}
                    </span>
                  </div>

                  {/* Guest identity — only asked of signed-out senders */}
                  {!isLoggedIn && (
                    <>
                      <div className="flex items-center gap-3 border-b border-black/5">
                        <span className="w-14 shrink-0 py-2.5 text-sm text-neutral-500">Name</span>
                        <input
                          name="senderName"
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          required
                          maxLength={120}
                          autoComplete="name"
                          placeholder="Your name"
                          className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                      <div className="flex items-center gap-3 border-b border-black/5">
                        <span className="w-14 shrink-0 py-2.5 text-sm text-neutral-500">
                          Contact
                        </span>
                        <input
                          name="senderContact"
                          value={senderContact}
                          onChange={(e) => setSenderContact(e.target.value)}
                          required
                          maxLength={200}
                          autoComplete="email"
                          placeholder="Email or phone — so they can reply"
                          className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-neutral-400"
                        />
                      </div>
                    </>
                  )}

                  {/* Subject */}
                  <div className="flex items-center gap-3 border-b border-black/5">
                    <span className="w-14 shrink-0 py-2.5 text-sm text-neutral-500">Subject</span>
                    <input
                      name="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      maxLength={150}
                      autoComplete="off"
                      placeholder="What's this about?"
                      className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-medium outline-none placeholder:text-neutral-400"
                    />
                  </div>

                  {/* Body — WYSIWYG */}
                  <MailEditor onChangeAction={setBodyHtml} minHeight={200} />

                  {!isLoggedIn && (
                    <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                      You&apos;re writing as a guest — {recipientName} can reply using the contact
                      info you shared.
                    </p>
                  )}

                  {error && (
                    <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600">
                      {error}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

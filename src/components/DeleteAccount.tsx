'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { deleteAccount, exportUserData } from '@/actions/account'

import { DownloadIcon, TrashIcon } from './icons'
import { Spinner } from './Spinner'

const CLOSE_MS = 300

export function DeleteAccount({ username }: { username: string }) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [downloadPending, startDownload] = useTransition()
  const [deletePending, startDelete] = useTransition()

  const close = useCallback(() => {
    if (closing || deletePending) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
      setConfirmation('')
      setError(null)
    }, CLOSE_MS)
  }, [closing, deletePending])

  // Lock scroll and support Escape while the dialog is open.
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

  const download = () => {
    setError(null)
    startDownload(async () => {
      const result = await exportUserData()
      if (result.error || !result.data) {
        setError(result.error ?? 'Could not export your data.')
        return
      }
      const url = URL.createObjectURL(new Blob([result.data], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `kitakits-${username}-data.json`
      a.click()
      URL.revokeObjectURL(url)
      setDownloaded(true)
    })
  }

  const confirmed = confirmation.trim() === username
  const confirmDelete = () => {
    if (!confirmed) return
    setError(null)
    startDelete(async () => {
      // A successful delete redirects to / — only an error comes back.
      const result = await deleteAccount(confirmation).catch(() => ({
        error: 'Could not delete your account. Please try again.',
      }))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <>
      <div className="glass flex items-center justify-between gap-4 rounded-3xl p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-red-600">Delete account</p>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
            Permanently remove your profile, posts, photos, and connections.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full bg-red-500/10 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-500/20"
        >
          Delete
        </button>
      </div>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
            <div
              className={`absolute inset-0 bg-red-950/40 backdrop-blur-sm ${
                closing ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'
              }`}
              onClick={close}
            />
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              className={`glass relative flex w-full max-w-md flex-col overflow-hidden rounded-t-[28px] p-6 sm:rounded-[28px] ${
                closing
                  ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
                  : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
              }`}
            >
              <div className="mx-auto mb-3 mt-0 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300/80 sm:hidden" />

              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
                  <TrashIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="delete-account-title" className="text-base font-semibold">
                    Delete your account?
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                    This permanently removes your profile, all your posts and photos, your followers
                    and connections, and your mailbox. This can&apos;t be undone.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={download}
                disabled={downloadPending || deletePending}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/60 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-white/90 disabled:opacity-50"
              >
                {downloadPending ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
                {downloaded && !downloadPending ? 'Download again' : 'Download my data'}
                <span className="text-xs font-normal text-neutral-400">(JSON)</span>
              </button>

              <div className="mt-4">
                <label
                  htmlFor="delete-confirm"
                  className="mb-1 block text-sm font-medium text-neutral-700"
                >
                  Type <span className="font-semibold">@{username}</span> to confirm
                </label>
                <input
                  id="delete-confirm"
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  disabled={deletePending}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={username}
                  className="glass-input"
                />
              </div>

              {error && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={deletePending}
                  className="flex-1 rounded-xl border border-black/10 bg-white/60 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-white/90 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={!confirmed || deletePending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
                >
                  {deletePending && <Spinner className="h-4 w-4 text-white" />}
                  {deletePending ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

'use client'

import { useState, useTransition } from 'react'

import { updatePrivacy } from '@/actions/users'

type Permission = 'everyone' | 'followers' | 'off'

const PERMISSIONS: { value: Permission; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'off', label: 'Off' },
]

export function PrivacySettings({
  initial,
  username,
}: {
  initial: {
    isPrivate: boolean
    discoverable: boolean
    publicProfile: boolean
    commentPermission: Permission
  }
  username: string
}) {
  const [isPrivate, setIsPrivate] = useState(initial.isPrivate)
  const [discoverable, setDiscoverable] = useState(initial.discoverable)
  const [publicProfile, setPublicProfile] = useState(initial.publicProfile)
  const [permission, setPermission] = useState<Permission>(initial.commentPermission)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = (data: Parameters<typeof updatePrivacy>[0], rollback: () => void) => {
    setError(null)
    startTransition(async () => {
      const result = await updatePrivacy(data)
      if (result.error) {
        rollback()
        setError(result.error)
      }
    })
  }

  const toggle = (
    key: 'isPrivate' | 'discoverable' | 'publicProfile',
    current: boolean,
    set: (value: boolean) => void,
  ) => {
    set(!current)
    save({ [key]: !current }, () => set(current))
  }

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/@${username}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const choose = (next: Permission) => {
    if (next === permission) return
    const prev = permission
    setPermission(next)
    save({ commentPermission: next }, () => setPermission(prev))
  }

  return (
    <div>
      <div className="glass divide-y divide-black/5 rounded-3xl">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Private account</p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
              Only people who follow you can see your posts.
            </p>
          </div>
          <Toggle
            on={isPrivate}
            disabled={pending}
            label="Private account"
            onToggleAction={() => toggle('isPrivate', isPrivate, setIsPrivate)}
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Show in search</p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
              Allow others to find you in Explore.
            </p>
          </div>
          <Toggle
            on={discoverable}
            disabled={pending}
            label="Show in search"
            onToggleAction={() => toggle('discoverable', discoverable, setDiscoverable)}
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Public profile</p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
              Anyone with the link can view your profile — no account needed.
            </p>
            {publicProfile && (
              <div className="mt-2 flex items-center gap-2">
                <code className="truncate rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700">
                  /@{username}
                </code>
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-black/10"
                >
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            )}
          </div>
          <Toggle
            on={publicProfile}
            disabled={pending}
            label="Public profile"
            onToggleAction={() => toggle('publicProfile', publicProfile, setPublicProfile)}
          />
        </div>

        <div className="p-4">
          <p className="text-sm font-medium">Comments</p>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
            Who can comment on your posts.
          </p>
          <div className="mt-3 flex rounded-full bg-black/5 p-1">
            {PERMISSIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => choose(value)}
                disabled={pending}
                className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-all disabled:opacity-50 ${
                  permission === value
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function Toggle({
  on,
  disabled,
  label,
  onToggleAction,
}: {
  on: boolean
  disabled: boolean
  label: string
  onToggleAction: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggleAction}
      disabled={disabled}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
        on ? 'bg-emerald-500' : 'bg-neutral-300'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-7 w-7 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

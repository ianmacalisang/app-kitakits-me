'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'

import {
  changePassword,
  checkUsername,
  login,
  register,
  requestPasswordReset,
  resetPassword,
} from '@/actions/auth'
import { updateProfile } from '@/actions/users'
import { compressImage } from '@/lib/image'

import { Avatar } from './Avatar'
import { BlurImage } from './BlurImage'
import { CheckIcon, EyeIcon, EyeOffIcon, ImageIcon, XIcon } from './icons'
import { Spinner } from './Spinner'

const inputClass = 'glass-input'

const labelClass = 'mb-0.5 block text-sm font-medium text-neutral-600'

const submitClass =
  'btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm'

const errorClass =
  'rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600'

const successClass =
  'rounded-xl border border-accent-500/25 bg-accent-500/10 px-3 py-2 text-sm text-accent-700'

const hintClass = 'mt-1.5 text-xs'

function PasswordField({
  id,
  name = 'password',
  label = 'Password',
  autoComplete,
  minLength,
  hint,
  defaultValue,
  invalid,
  onChange,
}: {
  id: string
  name?: string
  label?: string
  autoComplete: string
  minLength?: number
  hint?: React.ReactNode
  defaultValue?: string
  invalid?: boolean
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          onChange={onChange}
          aria-invalid={invalid}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 transition-colors hover:text-neutral-600"
        >
          {show ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
        </button>
      </div>
      {hint}
    </div>
  )
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, {})

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          defaultValue={state.values?.email}
          className={inputClass}
        />
      </div>
      <PasswordField
        id="password"
        autoComplete="current-password"
        defaultValue={state.values?.password}
      />
      <div className="-mt-1 flex items-center justify-between">
        <label
          htmlFor="remember"
          className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-neutral-600"
        >
          <input
            id="remember"
            name="remember"
            type="checkbox"
            defaultChecked
            className="h-3.5 w-3.5 rounded border-neutral-300 accent-accent-600"
          />
          Remember me
        </label>
        <Link
          href="/forgot-password"
          className="text-xs font-medium text-accent-700 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      {state.error && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending && <Spinner className="h-4 w-4 text-white" />}
        {pending ? 'Logging in…' : 'Log in'}
      </button>
      <p className="text-center text-sm text-neutral-500">
        No account?{' '}
        <Link href="/register" className="font-medium text-accent-700 hover:underline">
          Register
        </Link>
      </p>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {})

  if (state.success) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className={successClass}>
          If an account exists for that email, a reset link is on its way. Check your inbox — and
          the spam folder.
        </p>
        <p className="text-center text-sm text-neutral-500">
          <Link href="/login" className="font-medium text-accent-700 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>
      {state.error && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending && <Spinner className="h-4 w-4 text-white" />}
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="text-center text-sm text-neutral-500">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-accent-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, {})
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const confirmMismatch = confirm.length > 0 && confirm !== password

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        if (password !== confirm) e.preventDefault()
      }}
    >
      <input type="hidden" name="token" value={token} />
      <PasswordField
        id="password"
        autoComplete="new-password"
        minLength={8}
        onChange={(e) => setPassword(e.target.value)}
        hint={<p className={`${hintClass} text-neutral-400`}>At least 8 characters.</p>}
      />
      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        onChange={(e) => setConfirm(e.target.value)}
        invalid={confirmMismatch}
        hint={
          confirm.length > 0 ? (
            <p className={`${hintClass} ${confirmMismatch ? 'text-red-600' : 'text-accent-600'}`}>
              {confirmMismatch ? 'Passwords do not match.' : 'Passwords match.'}
            </p>
          ) : undefined
        }
      />
      {state.error && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending && <Spinner className="h-4 w-4 text-white" />}
        {pending ? 'Resetting…' : 'Reset password'}
      </button>
      <p className="text-center text-sm text-neutral-500">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-accent-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  )
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/

type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken'

export function RegisterForm({
  next,
  initialUsername,
}: {
  next?: string
  initialUsername?: string
}) {
  const [state, formAction, pending] = useActionState(register, {})
  const [username, setUsername] = useState(initialUsername ?? '')
  const [checked, setChecked] = useState<{ username: string; available: boolean } | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const confirmMismatch = confirm.length > 0 && confirm !== password

  useEffect(() => {
    if (!USERNAME_PATTERN.test(username)) return
    const timer = setTimeout(() => {
      void checkUsername(username)
        .then((available) => setChecked({ username, available }))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
  }, [username])

  const usernameStatus: UsernameStatus = !username
    ? 'idle'
    : !USERNAME_PATTERN.test(username)
      ? 'invalid'
      : checked?.username === username
        ? checked.available
          ? 'available'
          : 'taken'
        : 'checking'

  const usernameHint = {
    idle: '3–30 characters — letters, numbers, and underscores.',
    invalid: 'Only letters, numbers, and underscores — 3–30 characters.',
    checking: 'Checking availability…',
    available: `@${username} is available.`,
    taken: `@${username} is already taken.`,
  }[usernameStatus]

  const usernameHintClass =
    usernameStatus === 'available'
      ? 'text-accent-600'
      : usernameStatus === 'taken' || usernameStatus === 'invalid'
        ? 'text-red-600'
        : 'text-neutral-400'

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        if (password !== confirm || usernameStatus === 'taken') e.preventDefault()
      }}
    >
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          autoComplete="name"
          maxLength={80}
          placeholder="Juan Dela Cruz"
          defaultValue={state.values?.name}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="username" className={labelClass}>
          Username
        </label>
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[15px] text-neutral-400"
          >
            @
          </span>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            pattern="[a-zA-Z0-9_]{3,30}"
            minLength={3}
            maxLength={30}
            placeholder="juandc"
            defaultValue={state.values?.username ?? initialUsername}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={usernameStatus === 'taken' || usernameStatus === 'invalid'}
            aria-describedby="username-hint"
            className={`${inputClass} pl-8`}
          />
        </div>
        <div
          id="username-hint"
          className={`${hintClass} flex items-center gap-1 ${usernameHintClass}`}
        >
          {usernameStatus === 'checking' && <Spinner className="h-3 w-3" />}
          {usernameStatus === 'available' && <CheckIcon className="h-3.5 w-3.5" />}
          <span>{usernameHint}</span>
        </div>
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          defaultValue={state.values?.email}
          className={inputClass}
        />
      </div>
      <PasswordField
        id="password"
        autoComplete="new-password"
        minLength={8}
        defaultValue={state.values?.password}
        onChange={(e) => setPassword(e.target.value)}
        hint={<p className={`${hintClass} text-neutral-400`}>At least 8 characters.</p>}
      />
      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        defaultValue={state.values?.confirmPassword}
        onChange={(e) => setConfirm(e.target.value)}
        invalid={confirmMismatch}
        hint={
          confirm.length > 0 ? (
            <p className={`${hintClass} ${confirmMismatch ? 'text-red-600' : 'text-accent-600'}`}>
              {confirmMismatch ? 'Passwords do not match.' : 'Passwords match.'}
            </p>
          ) : undefined
        }
      />
      <label
        htmlFor="agreeTerms"
        className="flex cursor-pointer items-start gap-2.5 text-xs font-medium text-neutral-600"
      >
        <input
          id="agreeTerms"
          name="agreeTerms"
          type="checkbox"
          required
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-neutral-300 accent-accent-600"
        />
        <span>
          I agree to the{' '}
          <Link
            href="/terms"
            target="_blank"
            className="font-semibold text-accent-700 hover:underline"
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            target="_blank"
            className="font-semibold text-accent-700 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {state.error && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending && <Spinner className="h-4 w-4 text-white" />}
        {pending ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-center text-sm text-neutral-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  )
}

export function CoverField({ coverUrl }: { coverUrl?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const src = preview ?? coverUrl

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const setFile = (file: File | null | undefined) => {
    const input = inputRef.current
    if (!input) return
    if (!file || !file.type.startsWith('image/')) {
      input.value = ''
      setPreview(null)
      return
    }
    void compressImage(file, { maxSize: 1920 }).then((compressed) => {
      const dt = new DataTransfer()
      dt.items.add(compressed)
      input.files = dt.files
      setPreview(URL.createObjectURL(compressed))
    })
  }

  const clear = () => {
    const input = inputRef.current
    if (input) input.value = ''
    setPreview(null)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Change cover photo"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          setFile(e.dataTransfer.files?.[0])
        }}
        className={`group relative aspect-[3/1] w-full cursor-pointer overflow-hidden rounded-2xl ring-2 transition ${
          dragging ? 'ring-accent-400' : 'ring-transparent hover:ring-white/60'
        }`}
      >
        {src ? (
          <BlurImage src={src} alt="Cover preview" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent-200/80 via-accent-200/70 to-accent-200/70" />
        )}

        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white transition ${
            dragging
              ? 'bg-black/40 opacity-100'
              : 'bg-black/0 opacity-0 group-hover:bg-black/30 group-hover:opacity-100'
          }`}
        >
          <ImageIcon className="h-6 w-6" />
          <span className="text-xs font-semibold drop-shadow">
            {dragging ? 'Drop to upload' : src ? 'Change cover' : 'Add cover photo'}
          </span>
        </div>

        {preview && !dragging && (
          <button
            type="button"
            aria-label="Remove selected image"
            onClick={(e) => {
              e.stopPropagation()
              clear()
            }}
            className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white backdrop-blur transition hover:bg-black/70"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        name="cover"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0])}
      />
      <p className="mt-1.5 text-xs text-neutral-400">
        Click or drag an image — 1200×400 recommended
      </p>
    </>
  )
}

export function EditProfileForm({
  initial,
  avatarUrl,
  coverUrl,
}: {
  initial: { name: string; username: string; bio: string; website: string }
  avatarUrl?: string
  coverUrl?: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateProfile, {})

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state, router])

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="avatar" className={labelClass}>
          Avatar
        </label>
        <div className="flex items-center gap-3">
          <Avatar src={avatarUrl} name={initial.name} />
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/*"
            className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-full file:border-0 file:bg-white/70 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-700 file:shadow-sm hover:file:bg-white dark:file:bg-neutral-700 dark:file:text-neutral-200 dark:hover:file:bg-neutral-600"
            onChange={async (e) => {
              const input = e.currentTarget
              const file = input.files?.[0]
              if (!file) return
              const compressed = await compressImage(file, { maxSize: 800 })
              const dt = new DataTransfer()
              dt.items.add(compressed)
              input.files = dt.files
            }}
          />
        </div>
      </div>
      <div>
        <span className={labelClass}>Cover photo</span>
        <CoverField coverUrl={coverUrl} />
      </div>
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={initial.name}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="username" className={labelClass}>
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          defaultValue={initial.username}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="bio" className={labelClass}>
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={300}
          defaultValue={initial.bio}
          className={`${inputClass} resize-none`}
        />
      </div>
      <div>
        <label htmlFor="website" className={labelClass}>
          Website
        </label>
        <input
          id="website"
          name="website"
          type="text"
          defaultValue={initial.website}
          placeholder="https://"
          className={inputClass}
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-accent-600">Profile updated.</p>}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  )
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="currentPassword" className={labelClass}>
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="newPassword" className={labelClass}>
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          className={inputClass}
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-accent-600">Password updated.</p>}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? 'Updating…' : 'Change password'}
      </button>
    </form>
  )
}

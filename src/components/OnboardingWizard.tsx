'use client'

import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react'

import { followMany } from '@/actions/follows'
import { completeOnboarding, searchUsers, updateProfile, updateTheme } from '@/actions/users'
import type { AboutBlockData, UserCardData } from '@/lib/serialize'

import { AboutEditor } from './AboutSection'
import { Avatar } from './Avatar'
import { BrandMark } from './Branding'
import {
  ChevronLeftIcon,
  ImageIcon,
  LayoutIcon,
  LockIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  TextIcon,
  UserIcon,
} from './icons'
import { PrivacySettings } from './PrivacySettings'
import { ProfileMedia } from './ProfileMedia'
import { Spinner } from './Spinner'

type Permission = 'everyone' | 'followers' | 'off'
type Theme = 'light' | 'dark' | 'system'

export interface OnboardingInitial {
  name: string
  username: string
  bio: string
  website: string
  avatarUrl?: string
  coverUrl?: string
  isPrivate: boolean
  discoverable: boolean
  publicProfile: boolean
  commentPermission: Permission
  testimonialPermission: Permission
  theme: Theme
  about: AboutBlockData[]
}

const inputClass = 'glass-input'
const labelClass = 'mb-1 block text-sm font-medium text-neutral-700'
const submitClass = 'btn-primary flex-1 rounded-xl py-2.5 text-sm'
const skipClass =
  'rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 disabled:opacity-50'
const backClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/5 text-neutral-500 transition-colors hover:bg-black/10 disabled:opacity-50'

const THEME_OPTIONS: {
  value: Theme
  label: string
  description: string
  icon: typeof SunIcon
  preview: string
  iconColor: string
}[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright & airy',
    icon: SunIcon,
    preview: 'bg-gradient-to-br from-white via-accent-50 to-accent-100 ring-1 ring-black/10',
    iconColor: 'text-amber-500',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Easy on the eyes',
    icon: MoonIcon,
    preview: 'bg-gradient-to-br from-neutral-900 via-accent-950 to-accent-950 ring-1 ring-white/10',
    iconColor: 'text-accent-300',
  },
  {
    value: 'system',
    label: 'System',
    description: 'Matches device',
    icon: MonitorIcon,
    preview:
      'bg-gradient-to-r from-white from-50% via-accent-950 via-50% to-neutral-900 ring-1 ring-black/10',
    iconColor: 'text-neutral-500',
  },
]

export function OnboardingWizard({
  initial,
  suggestions,
}: {
  initial: OnboardingInitial
  suggestions: UserCardData[]
}) {
  const firstName = initial.name.split(' ')[0] || initial.name

  const steps = [
    {
      title: `Welcome, ${firstName}`,
      description:
        'This is how your profile will look — tap your avatar or the cover to add your photos.',
      icon: ImageIcon,
    },
    {
      title: 'Introduce yourself',
      description: 'A short bio and a link help people get to know you.',
      icon: TextIcon,
    },
    {
      title: 'Build your about page',
      description:
        'Pick a template or start from blank — mix text, lists, links, photos, and embeds.',
      icon: LayoutIcon,
    },
    {
      title: 'Choose your privacy',
      description:
        'Control who can see and interact with you. You can change these anytime in Settings.',
      icon: LockIcon,
    },
    {
      title: 'Pick your theme',
      description: 'Choose how Kitakits looks — you can switch it anytime in Settings.',
      icon: MoonIcon,
    },
    {
      title: 'Find people to follow',
      description: 'Pick a few members to follow — their posts will show up in your feed.',
      icon: UserIcon,
    },
  ]

  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [followedIds, setFollowedIds] = useState<ReadonlySet<number>>(new Set())
  const [bioLength, setBioLength] = useState(initial.bio.length)
  const [theme, setTheme] = useState<Theme>(initial.theme)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserCardData[] | null>(null)
  const searchSeq = useRef(0)
  const last = steps.length - 1

  const shown = suggestions.filter((p) => !followedIds.has(p.id)).slice(0, 8)
  const searching = query.trim().length > 0
  const visible = searching ? (results ?? []) : shown
  const selectable = visible.filter((p) => !followedIds.has(p.id) && !p.isFollowing)
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.id))

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const seq = ++searchSeq.current
    const timer = setTimeout(() => {
      void searchUsers(q)
        .then((res) => {
          if (seq === searchSeq.current) setResults(res.items)
        })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectable.map((p) => p.id)))
  }

  const next = () => {
    setError(null)
    setStep((s) => Math.min(s + 1, last))
  }

  const back = () => {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  const chooseTheme = (nextTheme: Theme) => {
    setTheme(nextTheme)
    const dark =
      nextTheme === 'dark' ||
      (nextTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.setAttribute('data-theme', nextTheme)
    startTransition(async () => {
      const res = await updateTheme(nextTheme)
      if (res.error) setError(res.error)
    })
  }

  const submitDetails = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateProfile({}, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      next()
    })
  }

  const followSelected = () => {
    const ids = [...selected]
    startTransition(async () => {
      const res = await followMany(ids)
      setFollowedIds((prev) => new Set([...prev, ...res.followedIds]))
      setSelected(new Set())
    })
  }

  const finish = () => {
    startTransition(async () => {
      const res = await completeOnboarding()
      if (res?.error) setError(res.error)
    })
  }

  const StepIcon = steps[step].icon

  const backButton = (
    <button type="button" onClick={back} disabled={pending} aria-label="Back" className={backClass}>
      <ChevronLeftIcon className="h-5 w-5" />
    </button>
  )

  return (
    <div className="w-full max-w-xl animate-page-in">
      <div className="mx-auto mb-5 w-fit">
        <BrandMark size="lg" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-accent-500' : 'bg-black/10'
              } ${i === step ? 'shadow-[0_0_10px_rgba(64,64,64,0.45)]' : ''}`}
            />
          ))}
        </div>
        <span className="text-xs font-medium tabular-nums text-neutral-500">
          {step + 1}/{steps.length}
        </span>
      </div>

      <div className="glass rounded-3xl p-6">
        <div key={step} className="animate-page-in">
          <div className="flex items-start gap-3.5">
            <span className="btn-accent-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <StepIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">{steps[step].title}</h1>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-500">
                {steps[step].description}
              </p>
            </div>
          </div>

          {step === 0 && (
            <div className="mt-5">
              <div className="relative overflow-hidden rounded-2xl pb-5 ring-1 ring-black/5 sm:pb-6">
                <ProfileMedia
                  isSelf
                  avatarUrl={initial.avatarUrl}
                  coverUrl={initial.coverUrl}
                  name={initial.name}
                  username={initial.username}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                Tap the avatar or &ldquo;Edit cover&rdquo; to upload — or drag an image onto the
                cover. You can skip this and add photos later.
              </p>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <div className="mt-5 flex items-center gap-2">
                <button type="button" onClick={next} className={submitClass}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={submitDetails} className="mt-5 flex flex-col gap-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="bio" className={labelClass}>
                    Bio
                  </label>
                  <span className="text-[11px] tabular-nums text-neutral-400">{bioLength}/300</span>
                </div>
                <textarea
                  id="bio"
                  name="bio"
                  rows={3}
                  maxLength={300}
                  defaultValue={initial.bio}
                  placeholder="Tell people a little about yourself"
                  onChange={(e) => setBioLength(e.target.value.length)}
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                {backButton}
                <button type="submit" disabled={pending} className={submitClass}>
                  {pending ? 'Saving…' : 'Continue'}
                </button>
                <button type="button" onClick={next} disabled={pending} className={skipClass}>
                  Skip
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="mt-5">
              <AboutEditor initial={initial.about} onDoneAction={next} />
              <div className="mt-5 flex items-center gap-2">
                {backButton}
                <button type="button" onClick={next} className={submitClass}>
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-5">
              <PrivacySettings
                username={initial.username}
                initial={{
                  isPrivate: initial.isPrivate,
                  discoverable: initial.discoverable,
                  publicProfile: initial.publicProfile,
                  commentPermission: initial.commentPermission,
                  testimonialPermission: initial.testimonialPermission,
                }}
              />
              <div className="mt-5 flex items-center gap-2">
                {backButton}
                <button type="button" onClick={next} className={submitClass}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-5">
              <div className="grid grid-cols-3 gap-3">
                {THEME_OPTIONS.map(
                  ({ value, label, description, icon: Icon, preview, iconColor }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => chooseTheme(value)}
                      aria-pressed={theme === value}
                      className={`flex flex-col items-center gap-2.5 rounded-2xl p-3.5 transition ${
                        theme === value
                          ? 'bg-accent-500/10 ring-2 ring-accent-500/60'
                          : 'bg-white/40 ring-1 ring-transparent hover:bg-white/60'
                      }`}
                    >
                      <span
                        className={`flex h-16 w-full items-center justify-center rounded-xl ${preview}`}
                      >
                        <Icon className={`h-6 w-6 ${iconColor}`} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="block text-[11px] text-neutral-500">{description}</span>
                      </span>
                    </button>
                  ),
                )}
              </div>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <div className="mt-5 flex items-center gap-2">
                {backButton}
                <button type="button" onClick={next} className={submitClass}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="mt-5">
              <div className="relative">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (!e.target.value.trim()) setResults(null)
                  }}
                  placeholder="Search people…"
                  aria-label="Search people"
                  className={`${inputClass} pl-9`}
                />
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
                  <SearchIcon className="h-4 w-4 text-neutral-400" />
                </span>
              </div>

              {searching && results === null ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-5 w-5 text-neutral-400" />
                </div>
              ) : visible.length > 0 ? (
                <>
                  <div className="mb-2.5 mt-3 flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-400">
                      {searching ? 'Results' : 'Suggested'}
                    </p>
                    {selectable.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-xs font-medium text-accent-700 hover:underline"
                      >
                        {allSelected ? 'Clear all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {visible.map((person, i) => {
                      const isFollowing = followedIds.has(person.id) || person.isFollowing
                      const isSelected = selected.has(person.id)
                      const info = (
                        <>
                          <Avatar src={person.avatarUrl} name={person.name} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{person.name}</p>
                            <p className="truncate text-xs text-neutral-500">
                              @{person.username}
                              {person.followerCount !== undefined && (
                                <>
                                  {' '}
                                  · {person.followerCount}{' '}
                                  {person.followerCount === 1 ? 'follower' : 'followers'}
                                </>
                              )}
                            </p>
                            {person.bio && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">
                                {person.bio}
                              </p>
                            )}
                          </div>
                        </>
                      )
                      return (
                        <li
                          key={person.id}
                          className="animate-fade-in"
                          style={{ animationDelay: `${Math.min(i * 45, 270)}ms` }}
                        >
                          {isFollowing ? (
                            <div className="flex w-full items-center gap-3 rounded-2xl bg-white/40 p-3 opacity-70">
                              {info}
                              <span className="shrink-0 rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium text-neutral-500">
                                Following
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleSelect(person.id)}
                              aria-pressed={isSelected}
                              className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${
                                isSelected
                                  ? 'bg-accent-500/10 ring-1 ring-accent-500/40'
                                  : 'bg-white/40 hover:bg-white/60'
                              }`}
                            >
                              {info}
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                                  isSelected
                                    ? 'scale-100 border-accent-500 bg-accent-500 text-white'
                                    : 'scale-90 border-neutral-300 text-transparent'
                                }`}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                  className="h-3.5 w-3.5"
                                >
                                  <path
                                    d="M5 13l4 4L19 7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : (
                <div className="mt-3 rounded-2xl bg-white/40 p-5 text-center">
                  <p className="text-sm text-neutral-500">
                    {searching
                      ? `No people found for "${query.trim()}".`
                      : followedIds.size > 0
                        ? "You're all set — you can discover more people in Explore."
                        : 'No suggestions right now — you can discover people in Explore.'}
                  </p>
                </div>
              )}
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <div className="mt-5 flex items-center gap-2">
                {backButton}
                {selected.size > 0 ? (
                  <button
                    type="button"
                    onClick={followSelected}
                    disabled={pending}
                    className={submitClass}
                  >
                    {pending
                      ? 'Following…'
                      : `Follow ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`}
                  </button>
                ) : (
                  <button type="button" onClick={finish} disabled={pending} className={submitClass}>
                    {pending ? 'Finishing…' : 'Finish'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-neutral-400">
        You can update all of this later in Settings.
      </p>
    </div>
  )
}

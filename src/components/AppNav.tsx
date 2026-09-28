'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { logout } from '@/actions/auth'
import { getNavBadgeCounts } from '@/actions/nav'
import { searchUsers, updateTheme } from '@/actions/users'
import type { UserCardData } from '@/lib/serialize'

import { Avatar } from './Avatar'
import { BrandMark } from './Branding'
import { useChat } from './chat/ChatProvider'
import { CreatePost } from './CreatePost'
import { NotificationsMenu } from './NotificationsMenu'
import {
  ChatIcon,
  ChevronDownIcon,
  CompassIcon,
  HomeIcon,
  LogoutIcon,
  MailboxIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TestimonialIcon,
  UsersIcon,
  XIcon,
} from './icons'
import { Spinner } from './Spinner'

type Theme = 'light' | 'dark' | 'system'

const THEME_ICONS: Record<'light' | 'dark', typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
}

interface AppNavProps {
  name: string
  username: string
  avatarUrl?: string
  unreadCount: number
  unreadMailCount: number
  pendingTestimonialCount: number
  theme: Theme
}

function Logo() {
  return (
    <Link href="/home" className="flex shrink-0 items-center">
      <BrandMark size="sm" />
    </Link>
  )
}

function HeaderSearch() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [results, setResults] = useState<UserCardData[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLFormElement>(null)

  // Close the autocomplete dropdown when clicking outside of it.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const submit = () => {
    const q = value.trim()
    go(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore')
  }

  const handleChange = (next: string) => {
    setValue(next)
    setActive(-1)
    if (timer.current) clearTimeout(timer.current)
    const q = next.trim()
    if (!q) {
      setResults([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const result = await searchUsers(q, 1)
        setResults(result.items.slice(0, 6))
        setOpen(true)
      })
    }, 300)
  }

  const clear = () => {
    setValue('')
    setResults([])
    setOpen(false)
    if (timer.current) clearTimeout(timer.current)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(`/profile/${results[active].username}`)
    }
  }

  return (
    <form
      ref={boxRef}
      role="search"
      className="relative mx-3 min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.trim() && results.length) setOpen(true)
        }}
        placeholder="Search"
        aria-label="Search"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="header-search-results"
        aria-activedescendant={
          active >= 0 && results[active] ? `header-search-option-${results[active].id}` : undefined
        }
        autoComplete="off"
        className="glass-input h-9 rounded-full py-0 pl-10 pr-9 text-sm"
      />
      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
        {pending ? (
          <Spinner className="h-4 w-4 text-neutral-400" />
        ) : value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-300/80 text-white transition-colors hover:bg-neutral-400"
          >
            <XIcon className="h-3 w-3" />
          </button>
        ) : null}
      </span>

      {open && (
        <div
          id="header-search-results"
          role="listbox"
          // Below sm the input is too narrow — pin the dropdown to the
          // viewport edges (same inset as the floating header pill). From sm
          // up it hugs the input instead.
          className="glass-pop motion-safe:animate-menu-pop fixed inset-x-4 top-14 z-20 mt-2 origin-top rounded-2xl p-1.5 sm:absolute sm:inset-x-0 sm:top-full sm:mt-[18px]"
        >
          {pending && results.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-4 w-4 text-neutral-400" />
            </div>
          ) : (
            <>
              {results.map((user, i) => (
                <button
                  key={user.id}
                  id={`header-search-option-${user.id}`}
                  role="option"
                  aria-selected={active === i}
                  type="button"
                  onClick={() => go(`/profile/${user.username}`)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
                    active === i ? 'bg-white/70' : 'hover:bg-white/70'
                  }`}
                >
                  <Avatar src={user.avatarUrl} name={user.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold leading-tight">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs leading-tight text-neutral-500">
                      @{user.username}
                    </span>
                  </span>
                </button>
              ))}
              {results.length === 0 && (
                <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-500">
                  <UsersIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                  No people found.
                </div>
              )}
              <button
                type="button"
                onClick={submit}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-neutral-600 transition-colors hover:bg-white/70"
              >
                <SearchIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="truncate">
                  Search for <span className="font-semibold">“{value.trim()}”</span>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </form>
  )
}

export function AppNav({
  name,
  username,
  avatarUrl,
  unreadCount,
  unreadMailCount,
  pendingTestimonialCount,
  theme: themeProp,
}: AppNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // The dropdown lives outside the glass header (whose backdrop-filter would
  // otherwise become its containing block), so outside clicks have to check
  // it separately from the avatar button.
  const menuPopRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<Theme>(themeProp)

  // Keep the selector in sync when the server-rendered prop changes.
  const [prevThemeProp, setPrevThemeProp] = useState(themeProp)
  if (prevThemeProp !== themeProp) {
    setPrevThemeProp(themeProp)
    setTheme(themeProp)
  }

  // Badge counts live in state so polling can bump them without a server
  // re-render; fresh props (router.refresh) still win when they land.
  const [badges, setBadges] = useState({
    unread: unreadCount,
    unreadMail: unreadMailCount,
    pendingTestimonials: pendingTestimonialCount,
  })
  const [prevBadgeProps, setPrevBadgeProps] = useState({
    unreadCount,
    unreadMailCount,
    pendingTestimonialCount,
  })
  if (
    prevBadgeProps.unreadCount !== unreadCount ||
    prevBadgeProps.unreadMailCount !== unreadMailCount ||
    prevBadgeProps.pendingTestimonialCount !== pendingTestimonialCount
  ) {
    setPrevBadgeProps({ unreadCount, unreadMailCount, pendingTestimonialCount })
    setBadges({
      unread: unreadCount,
      unreadMail: unreadMailCount,
      pendingTestimonials: pendingTestimonialCount,
    })
  }

  // Baseline for "is this new?" detection across polls — props are the source
  // of truth, re-synced whenever a server re-render delivers fresh counts.
  const lastBadgesRef = useRef({
    unread: unreadCount,
    unreadMail: unreadMailCount,
    pendingTestimonials: pendingTestimonialCount,
  })
  useEffect(() => {
    lastBadgesRef.current = {
      unread: unreadCount,
      unreadMail: unreadMailCount,
      pendingTestimonials: pendingTestimonialCount,
    }
  }, [unreadCount, unreadMailCount, pendingTestimonialCount])

  // Poll for new notifications/mail/testimonials — catches counts that didn't
  // trigger a server re-render. When a count goes UP something new arrived,
  // so refresh the route too: the notifications menu, mailbox, and feed pick
  // it up immediately instead of waiting for the next navigation.
  // Skips while the tab is hidden.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return
      const result = await getNavBadgeCounts()
      if (!result) return
      setBadges(result)
      const prev = lastBadgesRef.current
      lastBadgesRef.current = result
      if (
        result.unread > prev.unread ||
        result.unreadMail > prev.unreadMail ||
        result.pendingTestimonials > prev.pendingTestimonials
      ) {
        router.refresh()
      }
    }
    const timer = setInterval(tick, 12000)
    return () => clearInterval(timer)
  }, [router])

  // Close the user dropdown when clicking outside of it or pressing Escape.
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !menuPopRef.current?.contains(t)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Close the dropdown when navigating away.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    setMenuOpen(false)
  }

  // Pending chat invites come from the WS session (client-side only) — no
  // server badge count needed since nothing is persisted.
  const chat = useChat()
  const chatInviteCount = chat?.incoming.length ?? 0

  const links: {
    href: string
    label: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    badge?: number
  }[] = [
    { href: '/home', label: 'Home', icon: HomeIcon },
    { href: '/explore', label: 'Explore', icon: CompassIcon },
    { href: '/mailbox', label: 'Mailbox', icon: MailboxIcon, badge: badges.unreadMail },
    {
      href: '/testimonials',
      label: 'Testimonials',
      icon: TestimonialIcon,
      badge: badges.pendingTestimonials,
    },
  ]

  // Sliding pill — measure the active dock link so the indicator glides
  // between items instead of blinking on each one independently. Height comes
  // from the link (not the nav) so icon-only links get a perfect circle.
  const dockRef = useRef<HTMLElement>(null)
  const [thumb, setThumb] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const activeIndex = links.findIndex((l) => l.href === pathname)

  useEffect(() => {
    const nav = dockRef.current
    if (!nav) return
    const measure = () => {
      const el = nav.querySelectorAll<HTMLElement>('[data-dock-link]')[activeIndex]
      setThumb(
        el
          ? {
              left: el.offsetLeft,
              top: el.offsetTop,
              width: el.offsetWidth,
              height: el.offsetHeight,
            }
          : null,
      )
    }
    measure()
    // Labels appear at lg (changing widths) and the dock width tracks the
    // viewport — re-measure whenever the nav or a link resizes.
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    nav.querySelectorAll('[data-dock-link]').forEach((a) => ro.observe(a))
    return () => ro.disconnect()
  }, [activeIndex])

  const handleLogout = () => {
    setMenuOpen(false)
    // Drop cached pages/media so the next user of this device can't read them.
    navigator.serviceWorker?.controller?.postMessage('CLEAR_CACHES')
    startTransition(async () => {
      await logout()
    })
  }

  const chooseTheme = (next: Theme) => {
    if (next === theme) return
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.setAttribute('data-theme', next)
    startTransition(async () => {
      const res = await updateTheme(next)
      if (res?.error) {
        setTheme(themeProp)
        document.documentElement.classList.toggle(
          'dark',
          themeProp === 'dark' ||
            (themeProp === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
        )
        document.documentElement.setAttribute('data-theme', themeProp)
      }
    })
  }

  return (
    <>
      {/* Top header — floating pill matching the bottom dock */}
      <div className="group/header fixed inset-x-4 top-4 z-30 mx-auto flex max-w-3xl items-center gap-2">
        <header className="glass min-w-0 flex-1 rounded-full">
          <div className="flex h-14 w-full items-center justify-between px-4">
            <Logo />
            <HeaderSearch />

            <div className="shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className={`flex items-center gap-1 rounded-full p-1 pr-1.5 transition-colors ${
                  menuOpen ? 'bg-black/5' : 'hover:bg-black/5'
                }`}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar src={avatarUrl} name={name} size="sm" />
                <ChevronDownIcon
                  className={`h-4 w-4 text-neutral-400 transition-transform ${
                    menuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </header>

        {/* Account dropdown — a direct child of the outer fixed bar so it
            positions against the bar: the glass header's backdrop-filter would
            otherwise be its containing block and `right-0` would pin to the
            pill's edge. Centered under the bar on small screens; on sm+ the
            right edge matches the bell — 1rem in from the screen. */}
        {menuOpen && (
          <div
            ref={menuPopRef}
            role="menu"
            aria-label="Account"
            className="glass-pop motion-safe:animate-menu-pop absolute left-1/2 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] origin-top -translate-x-1/2 rounded-2xl p-1.5 sm:left-auto sm:right-0 sm:translate-x-0 sm:origin-top-right"
          >
            <Link
              href={`/profile/${username}`}
              onClick={() => setMenuOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/70"
            >
              <Avatar src={avatarUrl} name={name} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight">{name}</span>
                <span className="block truncate text-xs leading-tight text-neutral-500">
                  View profile
                </span>
              </span>
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-white/70"
            >
              <SettingsIcon className="h-4 w-4" />
              Settings
            </Link>
            <div className="mt-1 border-t border-black/5 p-1.5 pb-1 pt-2">
              <p className="px-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Theme
              </p>
              <div className="flex rounded-xl bg-black/5 p-1">
                {(['light', 'dark'] as const).map((t) => {
                  const active = theme === t
                  const Icon = THEME_ICONS[t]
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => chooseTheme(t)}
                      aria-pressed={active}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium capitalize transition ${
                        active
                          ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100 dark:shadow-none'
                          : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mt-1 border-t border-black/5 pt-1">
              <button
                onClick={handleLogout}
                disabled={pending}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <LogoutIcon className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        )}

        {/* Chat + notification pills — on small screens these collapse while
            the search input is focused, letting the header span full width */}
        <div className="flex shrink-0 items-center gap-2 max-sm:group-has-[form:focus-within]/header:hidden">
          <Link
            href="/chat"
            prefetch
            aria-label="Chat"
            title="Chat"
            aria-current={pathname === '/chat' ? 'page' : undefined}
            className={`glass relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors ${
              pathname === '/chat' ? 'text-accent-600' : 'text-neutral-700 hover:text-accent-600'
            }`}
          >
            <span className="relative">
              <ChatIcon className="h-6 w-6" />
              {chatInviteCount ? (
                <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {chatInviteCount > 99 ? '99+' : chatInviteCount}
                </span>
              ) : null}
            </span>
          </Link>
          <NotificationsMenu unreadCount={badges.unread} />
        </div>
      </div>

      {/* Floating bottom dock — matches the content column width */}
      <nav
        ref={dockRef}
        className="glass fixed inset-x-4 bottom-5 z-30 mx-auto flex max-w-3xl items-center rounded-full px-3 py-1.5"
      >
        {/* Sliding pill — fills the active item's slot, glides on navigation */}
        <span
          aria-hidden
          className={`absolute rounded-full bg-accent-700 shadow-md shadow-accent-900/25 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out dark:bg-accent-200 dark:shadow-none ${
            thumb ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            left: thumb?.left ?? 0,
            top: thumb?.top ?? 0,
            width: thumb?.width ?? 0,
            height: thumb?.height ?? 0,
          }}
        />
        <div className="flex flex-1 justify-around">
          {links.slice(0, 2).map(({ href, label, icon: Icon }) => (
            <DockLink key={href} href={href} label={label} active={pathname === href}>
              <Icon className="h-6 w-6" />
            </DockLink>
          ))}
        </div>
        <CreatePost avatarUrl={avatarUrl} name={name} />
        <div className="flex flex-1 justify-around">
          {links.slice(2).map(({ href, label, icon: Icon, badge }) => (
            <DockLink key={href} href={href} label={label} active={pathname === href} badge={badge}>
              <Icon className="h-6 w-6" />
            </DockLink>
          ))}
        </div>
      </nav>
    </>
  )
}

function DockLink({
  href,
  label,
  active,
  badge,
  children,
}: {
  href: string
  label: string
  active: boolean
  badge?: number
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      prefetch
      data-dock-link
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center justify-center gap-2 rounded-full p-2 transition-colors lg:px-4 ${
        active
          ? 'text-white dark:text-accent-900'
          : 'text-neutral-600 hover:bg-black/5 hover:text-neutral-900'
      }`}
    >
      <span className="relative">
        {children}
        {badge ? (
          <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span className="hidden text-sm font-medium lg:inline">{label}</span>
    </Link>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

import { BrandMark } from '@/components/Branding'
import { PublicPageTheme } from '@/components/PublicPageTheme'
import { getCurrentUser } from '@/lib/auth'
import { getSiteSettings } from '@/lib/settings'

export const metadata: Metadata = { title: 'Privacy Policy' }

const LAST_UPDATED = 'December 2025'

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-800">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-600">{children}</div>
    </section>
  )
}

export default async function PrivacyPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSiteSettings()])
  const app = settings.appName

  return (
    <main className="animate-page-in">
      {/* Public pages are always light — same treatment as the landing
          and Discover pages. */}
      <script
        dangerouslySetInnerHTML={{
          __html: "try{document.documentElement.classList.remove('dark')}catch(e){}",
        }}
      />
      <PublicPageTheme theme="light" visitorTheme={user?.theme ?? 'light'} />

      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label={app} className="flex w-fit items-center gap-2.5">
            <BrandMark size="sm" />
          </Link>
          {user ? (
            <Link href="/home" className="btn-primary rounded-full px-4 py-2 text-xs font-semibold">
              Balik sa feed
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="glass rounded-full px-4 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:text-neutral-900"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="btn-primary rounded-full px-4 py-2 text-xs font-semibold"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">
            Privacy Policy
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900">
            Ang data mo, sa&apos;yo pa rin
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-500">
            Last updated: {LAST_UPDATED} · This page explains what {app} collects, why, and the
            controls you have over it.
          </p>
        </div>

        <div className="glass mt-6 space-y-7 rounded-[2rem] p-6 sm:p-8">
          <Section title="What we collect">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="font-medium text-neutral-800">Account info</strong> — your name,
                @handle, email address, and a hashed (never plain-text) password.
              </li>
              <li>
                <strong className="font-medium text-neutral-800">Profile details</strong> — avatar,
                cover photo, bio, links, and badges you earn.
              </li>
              <li>
                <strong className="font-medium text-neutral-800">Your content</strong> — posts,
                comments, likes, shares, saves, follows, testimonials, and mail messages you send.
              </li>
              <li>
                <strong className="font-medium text-neutral-800">Preferences</strong> — theme choice
                and similar settings stored on your device and account.
              </li>
              <li>
                <strong className="font-medium text-neutral-800">Presence</strong> — online status
                and hangout participation, shown to other members while you&apos;re active.
              </li>
            </ul>
          </Section>

          <Section title="How we use it">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>To run the service — your feed, profile, mail, and hangouts.</li>
              <li>To keep you signed in and secure your account.</li>
              <li>To send notifications about activity on your posts, mail, and testimonials.</li>
              <li>
                To power community features like Discover, search, badges, and streaks.
              </li>
            </ul>
            <p>
              We don&apos;t sell your data, we don&apos;t run ads, and we don&apos;t use third-party
              trackers.
            </p>
          </Section>

          <Section title="What's public">
            <p>
              Posts you set to <strong className="font-medium text-neutral-800">public</strong> and
              your public @handle page are visible to anyone — including logged-out visitors and
              search engines. Posts set to <strong className="font-medium text-neutral-800">
                followers only
              </strong>{' '}
              or <strong className="font-medium text-neutral-800">private</strong> are only shown to
              the audience you picked.
            </p>
            <p>
              Testimonials written for you only appear on your profile after you approve them.
            </p>
          </Section>

          <Section title="Hangouts and live rooms">
            <p>
              Voice and video in hangout rooms (videoke, card tables) are transmitted in real time
              through our realtime media provider. Mail and hangout audio are delivered over
              encrypted connections between you and our servers.
            </p>
          </Section>

          <Section title="Third-party services">
            <p>We use a small number of providers to run {app}:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Database and hosting for storing your account and content.</li>
              <li>A media CDN for avatars, photos, and video thumbnails.</li>
              <li>A realtime provider for live audio/video in hangout rooms.</li>
              <li>YouTube embeds for videoke song playback, subject to YouTube&apos;s terms.</li>
            </ul>
            <p>
              These providers only receive the data needed to deliver the feature you&apos;re using.
            </p>
          </Section>

          <Section title="Cookies and storage">
            <p>
              We use a session cookie to keep you signed in and local storage for preferences like
              your theme. That&apos;s it — no advertising or analytics cookies.
            </p>
          </Section>

          <Section title="Your controls">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Choose a visibility level (public, followers, private) on every post.</li>
              <li>Set your profile to private and control who can mail you.</li>
              <li>Approve or reject testimonials before they appear.</li>
              <li>Block members you don&apos;t want to interact with.</li>
              <li>Delete your posts, comments, and mail at any time.</li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              We keep your data while your account exists. When you delete content it&apos;s removed
              from public view; backups and logs may retain it for a limited period before being
              purged.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Passwords are hashed, sessions are server-side, and traffic is encrypted in transit.
              No system is perfect — if you spot something, tell us and we&apos;ll fix it.
            </p>
          </Section>

          <Section title="Younger users">
            <p>
              {app} isn&apos;t intended for children under 13. If we learn a child under 13 has an
              account, we&apos;ll remove it.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If this policy changes, we&apos;ll update this page and revise the date above. Big
              changes get announced in-app.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions? Mail the {app} team in-app, or reach us through the contact details on our
              public pages.
            </p>
          </Section>
        </div>

        <p className="mt-8 text-center text-xs text-neutral-400">
          <Link href="/terms" className="font-medium text-neutral-500 hover:text-neutral-900">
            Terms of Service
          </Link>
          {' · '}
          <Link href="/" className="font-medium text-neutral-500 hover:text-neutral-900">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  )
}

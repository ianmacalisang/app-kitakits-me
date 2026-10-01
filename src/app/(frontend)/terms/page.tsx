import type { Metadata } from 'next'
import Link from 'next/link'

import { BrandMark } from '@/components/Branding'
import { PublicPageTheme } from '@/components/PublicPageTheme'
import { getCurrentUser } from '@/lib/auth'
import { getSiteSettings } from '@/lib/settings'

export const metadata: Metadata = { title: 'Terms of Service' }

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

export default async function TermsPage() {
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
            Terms of Service
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900">
            Ang house rules
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-500">
            Last updated: {LAST_UPDATED} · By using {app} you agree to these terms. Maikli lang —
            basahin mo muna.
          </p>
        </div>

        <div className="glass mt-6 space-y-7 rounded-[2rem] p-6 sm:p-8">
          <Section title="The basics">
            <p>
              {app} is a community for posting kwento, following friends, sending mail, and hanging
              out in live rooms. By creating an account or using the service, you agree to these
              Terms and our{' '}
              <Link
                href="/privacy"
                className="font-medium text-accent-700 underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </Section>

          <Section title="Your account">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>You must be at least 13 years old to use {app}.</li>
              <li>Your @handle is yours while your account is active — first come, first served.</li>
              <li>Keep your password private; you&apos;re responsible for activity on your account.</li>
              <li>
                Don&apos;t impersonate other people or claim handles that infringe someone&apos;s
                name or brand.
              </li>
            </ul>
          </Section>

          <Section title="Your content">
            <p>
              You own what you post. By posting, you give {app} a license to store, display, and
              share your content within the service — including showing public posts and your public
              @handle page to logged-out visitors and search engines.
            </p>
            <p>
              Visibility settings are respected: followers-only and private posts are only shown to
              the audience you choose.
            </p>
          </Section>

          <Section title="House rules">
            <p>Don&apos;t use {app} for:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Anything illegal under Philippine or applicable law.</li>
              <li>Harassment, hate speech, threats, or targeted abuse.</li>
              <li>Spam, scams, phishing, or misleading content.</li>
              <li>
                Sexual content involving minors, or any content that exploits anyone — this gets
                reported to authorities, not just removed.
              </li>
              <li>Posting someone&apos;s private information without consent.</li>
              <li>
                Adult content outside the designated NSFW category, or NSFW posts marked as public
                where the rules require otherwise.
              </li>
              <li>Automated scraping, bulk account creation, or abusing the service&apos;s APIs.</li>
            </ul>
            <p>
              We can remove content and suspend or terminate accounts that break these rules.
              Testimonials appear on your profile only if you approve them — you control what shows.
            </p>
          </Section>

          <Section title="Hangouts and live rooms">
            <p>
              Videoke and card rooms are shared live spaces. The same rules apply to voice, video,
              and chat inside them. Treat the room like a tambayan — walang bastusan.
            </p>
          </Section>

          <Section title="Mail">
            <p>
              Mail is private between sender and recipient. Don&apos;t use it for spam or
              harassment — recipients can block you, and abuse reports are taken seriously.
            </p>
          </Section>

          <Section title="Third-party services">
            <p>
              Some features rely on external services — realtime media for hangouts and YouTube for
              videoke playback. Your use of those features is also subject to their own terms.
            </p>
          </Section>

          <Section title="Changes to the service">
            <p>
              {app} is a work in progress. Features may change, move, or be removed — we&apos;ll try
              to announce significant changes in-app.
            </p>
          </Section>

          <Section title="Disclaimers">
            <p>
              {app} is provided &ldquo;as is&rdquo; without warranties of any kind. We don&apos;t
              guarantee the service will be uninterrupted, error-free, or that content posted by
              members is accurate. We&apos;re not responsible for what members post — but we do
              enforce the house rules.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              To the extent allowed by law, {app} and its operators aren&apos;t liable for indirect
              or consequential damages arising from your use of the service.
            </p>
          </Section>

          <Section title="Termination">
            <p>
              You can leave anytime by deleting your account. We can suspend or terminate accounts
              that violate these terms, with or without notice for serious violations.
            </p>
          </Section>

          <Section title="Governing law">
            <p>These terms are governed by the laws of the Republic of the Philippines.</p>
          </Section>

          <Section title="Changes to these terms">
            <p>
              If we update these terms, we&apos;ll revise the date above and post a notice in-app
              for significant changes. Continued use means you accept the updated terms.
            </p>
          </Section>

          <Section title="Contact">
            <p>Questions about these terms? Mail the {app} team in-app.</p>
          </Section>
        </div>

        <p className="mt-8 text-center text-xs text-neutral-400">
          <Link href="/privacy" className="font-medium text-neutral-500 hover:text-neutral-900">
            Privacy Policy
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

import { redirect } from 'next/navigation'

import { BrandMark } from '@/components/Branding'
import { LoginForm } from '@/components/forms'
import { getCurrentUser } from '@/lib/auth'
import { getSiteSettings } from '@/lib/settings'

export const metadata = { title: 'Log in' }

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/home')

  const settings = await getSiteSettings()

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="animate-page-in w-full max-w-sm">
        <div className="mx-auto mb-5 w-fit">
          <BrandMark size="lg" />
        </div>

        <p className="mt-1.5 text-center text-sm text-neutral-500">{settings.heroTagline}</p>
        <div className="glass mt-7 rounded-3xl p-6 sm:p-7">
          <h2 className="mb-5 text-center text-sm font-semibold text-neutral-700">
            {settings.loginPrompt}
          </h2>
          <LoginForm />
        </div>
      </div>
    </main>
  )
}

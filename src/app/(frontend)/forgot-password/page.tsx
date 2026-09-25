import { redirect } from 'next/navigation'

import { BrandMark } from '@/components/Branding'
import { ForgotPasswordForm } from '@/components/forms'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Forgot password' }

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser()
  if (user) redirect('/home')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="animate-page-in w-full max-w-sm">
        <div className="mx-auto mb-2 w-fit">
          <BrandMark size="lg" />
        </div>
        <div className="glass mt-4 rounded-3xl p-5 sm:p-6">
          <h2 className="mb-1 text-center text-sm font-semibold text-neutral-700">
            Reset your password
          </h2>
          <p className="mb-4 text-center text-xs text-neutral-400">
            Enter your account email and we&apos;ll send you a reset link.
          </p>
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  )
}

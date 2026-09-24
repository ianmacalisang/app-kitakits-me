import { redirect } from 'next/navigation'

import { BrandMark } from '@/components/Branding'
import { ForgotPasswordForm } from '@/components/forms'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Forgot password' }

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser()
  if (user) redirect('/home')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="animate-page-in w-full max-w-sm">
        <div className="mx-auto mb-5 w-fit">
          <BrandMark size="lg" />
        </div>
        <div className="glass mt-7 rounded-3xl p-6 sm:p-7">
          <h2 className="mb-2 text-center text-sm font-semibold text-neutral-700">
            Reset your password
          </h2>
          <p className="mb-5 text-center text-sm text-neutral-500">
            Enter your account email and we&apos;ll send you a reset link.
          </p>
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BrandMark } from '@/components/Branding'
import { ResetPasswordForm } from '@/components/forms'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Reset password' }

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const user = await getCurrentUser()
  if (user) redirect('/home')

  const { token } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="animate-page-in w-full max-w-sm">
        <div className="mx-auto mb-5 w-fit">
          <BrandMark size="lg" />
        </div>
        <div className="glass mt-7 rounded-3xl p-6 sm:p-7">
          <h2 className="mb-5 text-center text-sm font-semibold text-neutral-700">
            Choose a new password
          </h2>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="flex flex-col gap-4">
              <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
                That reset link is invalid. Request a new one.
              </p>
              <p className="text-center text-sm text-neutral-500">
                <Link
                  href="/forgot-password"
                  className="font-medium text-emerald-700 hover:underline"
                >
                  Request a reset link
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

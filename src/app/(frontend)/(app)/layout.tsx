import { redirect } from 'next/navigation'
import React from 'react'

import { AppNav } from '@/components/AppNav'
import { InstallPrompt } from '@/components/InstallPrompt'
import { ToastHost } from '@/components/ToastHost'
import { getCurrentUser } from '@/lib/auth'
import { getCachedNavBadgeCounts } from '@/lib/nav-cache'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl } from '@/lib/serialize'

export default async function AppLayout(props: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const [fullUser, { unread, unreadMail, pendingTestimonials }] = await Promise.all([
    payload.findByID({ collection: 'users', id: user.id, depth: 1 }),
    getCachedNavBadgeCounts(user.id),
  ])

  if (!fullUser.onboardedAt) redirect('/onboarding')

  return (
    <div className="min-h-screen">
      <AppNav
        name={user.name}
        username={user.username}
        avatarUrl={avatarUrl(fullUser)}
        unreadCount={unread}
        unreadMailCount={unreadMail}
        pendingTestimonialCount={pendingTestimonials}
        theme={fullUser.theme ?? 'light'}
      />
      <main>
        <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-24">{props.children}</div>
      </main>
      <ToastHost />
      <InstallPrompt />
    </div>
  )
}

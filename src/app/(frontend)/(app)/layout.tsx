import { redirect } from 'next/navigation'
import React from 'react'

import { AppNav } from '@/components/AppNav'
import { AcceptedBanner } from '@/components/chat/AcceptedBanner'
import { ChatProvider } from '@/components/chat/ChatProvider'
import { InviteBanner } from '@/components/chat/InviteBanner'
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
      <ChatProvider>
        <AppNav
          name={user.name}
          username={user.username}
          avatarUrl={avatarUrl(fullUser)}
          unreadCount={unread}
          unreadMailCount={unreadMail}
          pendingTestimonialCount={pendingTestimonials}
          theme={fullUser.theme ?? 'light'}
          defaultPostVisibility={fullUser.defaultPostVisibility ?? 'public'}
        />
        <main>
          <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-24">{props.children}</div>
        </main>
        <ToastHost />
        <InstallPrompt />
        {/* Chat banners share one anchored stack above the dock — same
            position for invites and accepted alerts, stacked when both show. */}
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
          <InviteBanner />
          <AcceptedBanner />
        </div>
      </ChatProvider>
    </div>
  )
}

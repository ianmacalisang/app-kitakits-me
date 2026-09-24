import { redirect } from 'next/navigation'

import { getSuggestedPeople } from '@/actions/users'
import { OnboardingWizard } from '@/components/OnboardingWizard'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl, coverUrl, toAboutBlocks } from '@/lib/serialize'

export const metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const fullUser = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 1,
    user,
    overrideAccess: false,
  })

  if (fullUser.onboardedAt) redirect('/home')

  const suggestions = await getSuggestedPeople(1)

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <OnboardingWizard
        initial={{
          name: fullUser.name,
          username: fullUser.username,
          bio: fullUser.bio ?? '',
          website: fullUser.website ?? '',
          avatarUrl: avatarUrl(fullUser),
          coverUrl: coverUrl(fullUser),
          isPrivate: fullUser.isPrivate ?? false,
          discoverable: fullUser.discoverable ?? true,
          publicProfile: fullUser.publicProfile ?? false,
          commentPermission: fullUser.commentPermission ?? 'everyone',
          theme: fullUser.theme ?? 'light',
          about: toAboutBlocks(fullUser),
        }}
        suggestions={suggestions.items}
      />
    </main>
  )
}

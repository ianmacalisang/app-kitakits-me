import { redirect } from 'next/navigation'

import { getSuggestedPeople } from '@/actions/users'
import { OnboardingWizard } from '@/components/OnboardingWizard'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { profileAccentValue, profileCardStyleValue, profileLayoutValue } from '@/lib/profileDesign'
import { avatarUrl, coverUrl, mediaUrl, toAboutBlocks } from '@/lib/serialize'

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

  const [suggestions, followers, following] = await Promise.all([
    getSuggestedPeople(1),
    payload.count({
      collection: 'follows',
      where: { following: { equals: user.id } },
      user,
      overrideAccess: false,
    }),
    payload.count({
      collection: 'follows',
      where: { follower: { equals: user.id } },
      user,
      overrideAccess: false,
    }),
  ])

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
          testimonialPermission: fullUser.testimonialPermission ?? 'everyone',
          theme: fullUser.theme ?? 'light',
          about: toAboutBlocks(fullUser),
          profileLayout: profileLayoutValue(fullUser),
          profileAccent: profileAccentValue(fullUser),
          profileCardStyle: profileCardStyleValue(fullUser),
          profileBackgroundUrl: mediaUrl(fullUser.profileBackground),
          followers: followers.totalDocs,
          following: following.totalDocs,
        }}
        suggestions={suggestions.items}
      />
    </main>
  )
}

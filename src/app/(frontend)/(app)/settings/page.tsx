import { redirect } from 'next/navigation'

import { Avatar } from '@/components/Avatar'
import { DeleteAccount } from '@/components/DeleteAccount'
import { ChangePasswordForm, EditProfileForm } from '@/components/forms'
import { PrivacySettings } from '@/components/PrivacySettings'
import { SettingsTabs } from '@/components/SettingsTabs'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadClient } from '@/lib/payload'
import { avatarUrl, coverUrl } from '@/lib/serialize'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
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

  const memberSince = new Date(fullUser.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
  const avatar = avatarUrl(fullUser)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Settings</h1>

      <SettingsTabs
        profile={
          <>
            {/* Account summary — iOS profile cell */}
            <div className="glass flex items-center gap-4 rounded-3xl p-5">
              <Avatar src={avatar} name={fullUser.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{fullUser.name}</p>
                <p className="truncate text-sm text-neutral-500">@{fullUser.username}</p>
                <p className="mt-1 truncate text-xs text-neutral-500">
                  {fullUser.email} · Member since {memberSince}
                </p>
              </div>
            </div>
            <div className="glass rounded-3xl p-5">
              <EditProfileForm
                avatarUrl={avatar}
                coverUrl={coverUrl(fullUser)}
                initial={{
                  name: fullUser.name,
                  username: fullUser.username,
                  bio: fullUser.bio ?? '',
                  website: fullUser.website ?? '',
                }}
              />
            </div>
          </>
        }
        account={
          <>
            <div className="glass rounded-3xl p-5">
              <h3 className="mb-4 text-sm font-semibold text-neutral-700">Change password</h3>
              <ChangePasswordForm />
            </div>
            <PrivacySettings
              username={fullUser.username}
              initial={{
                isPrivate: fullUser.isPrivate ?? false,
                discoverable: fullUser.discoverable ?? true,
                publicProfile: fullUser.publicProfile ?? false,
                profileViewTracking: fullUser.profileViewTracking ?? false,
                commentPermission: fullUser.commentPermission ?? 'everyone',
                testimonialPermission: fullUser.testimonialPermission ?? 'everyone',
              }}
            />
            <DeleteAccount username={fullUser.username} />
          </>
        }
      />
    </div>
  )
}

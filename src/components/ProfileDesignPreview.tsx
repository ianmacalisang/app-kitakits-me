import type {
  ProfileAccent,
  ProfileCardStyle,
  ProfileFont,
  ProfileLayout,
  ProfileTheme,
} from '@/lib/profileDesign'
import { PROFILE_FONT_FAMILIES } from '@/lib/profileFonts'

import { BlurImage } from './BlurImage'
import { MailIcon } from './icons'
import { PublicProfileHero } from './PublicProfileHero'

// Live preview of the public profile — renders the real PublicProfileHero
// inside a data-profile-accent frame so layout, accent, and background
// changes are visible before saving. The fake mail pill stands in for the
// real visitor CTA.
export function ProfileDesignPreview({
  layout,
  accent,
  cardStyle,
  theme,
  font,
  backgroundUrl,
  name,
  username,
  bio,
  website,
  avatarUrl,
  coverUrl,
  joinedLabel,
  followers,
  following,
}: {
  layout: ProfileLayout
  accent: ProfileAccent
  cardStyle: ProfileCardStyle
  theme: ProfileTheme
  font: ProfileFont
  backgroundUrl?: string | null
  name: string
  username: string
  bio: string | null
  website: string | null
  avatarUrl?: string
  coverUrl?: string
  joinedLabel: string
  followers: number
  following: number
}) {
  const fontFamily = PROFILE_FONT_FAMILIES[font]

  return (
    <div>
      <p className="mb-1.5 flex items-center justify-between text-sm font-medium text-neutral-600 dark:text-neutral-300">
        Preview
        <span className="text-[11px] font-normal text-neutral-400">/{'@' + username}</span>
      </p>
      <div
        data-profile-accent={accent === 'default' ? undefined : accent}
        data-profile-cards={cardStyle === 'glass' ? undefined : cardStyle}
        // Scoped theme box: `dark` activates the dark palette inside the
        // frame, `light` escapes a dark page so the app keeps the user's own
        // theme while the preview shows the page's. Colours mirror html/body.
        className={`relative overflow-hidden rounded-2xl ring-1 ring-black/10 dark:ring-white/10 ${
          theme === 'dark'
            ? 'dark bg-[#0a0a0a] text-neutral-100'
            : 'light bg-[#f4f4f4] text-neutral-900'
        }`}
        style={fontFamily ? { fontFamily } : undefined}
      >
        {/* Page backdrop — mirrors the fixed layer on the public page */}
        {backgroundUrl && (
          <div aria-hidden className="absolute inset-0">
            <BlurImage src={backgroundUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-white/55 dark:bg-black/55" />
          </div>
        )}
        <div className="relative p-3">
          <PublicProfileHero
            layout={layout}
            name={name}
            username={username}
            bio={bio}
            website={website}
            avatar={avatarUrl}
            cover={coverUrl}
            joinedLabel={joinedLabel}
            followers={followers}
            following={following}
            action={
              <span className="btn-primary mb-0.5 flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 pl-3.5 text-sm font-semibold shadow-md shadow-accent-900/20">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
                  <MailIcon className="h-3.5 w-3.5" />
                </span>
                Mail
              </span>
            }
          />
        </div>
      </div>
    </div>
  )
}

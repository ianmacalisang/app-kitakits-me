// Canonical values for the segmented tab bars, kept in a server-safe module
// so pages can validate the ?tab= search param before passing it down as
// initialTab — the URL stays the source of truth from the first paint.

export const HOME_TABS = ['feed', 'activities', 'saved'] as const
export type HomeTab = (typeof HOME_TABS)[number]

export const PROFILE_TABS = ['about', 'posts', 'media', 'testimonials', 'connections'] as const
export type ProfileTab = (typeof PROFILE_TABS)[number]

// The public /@handle page hides Connections — signed-out readers never see
// it, so ?tab=connections resolves to the default there.
export const PUBLIC_PROFILE_TABS: readonly ProfileTab[] = PROFILE_TABS.filter(
  (t) => t !== 'connections',
)

export const SETTINGS_TABS = ['profile', 'account'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export const TESTIMONIAL_TABS = ['review', 'profile', 'written'] as const
export type TestimonialTab = (typeof TESTIMONIAL_TABS)[number]

export const EXPLORE_TABS = ['foryou', 'hangouts'] as const
export type ExploreTab = (typeof EXPLORE_TABS)[number]

export const MAILBOX_TABS = ['inbox', 'sent', 'drafts'] as const
export type MailboxTab = (typeof MAILBOX_TABS)[number]

// Photos / Videos wall inside the profile Media tab — nested, so it uses its
// own param name (?tab=media&media=videos) instead of ?tab=.
export const MEDIA_GRID_TABS = ['images', 'videos'] as const
export type MediaGridTab = (typeof MEDIA_GRID_TABS)[number]

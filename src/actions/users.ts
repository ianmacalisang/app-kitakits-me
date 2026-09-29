'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { safeConnectPath } from '@/lib/connect-path'
import { getTopBadgesForUsers } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import {
  isProfileAccent,
  isProfileCardStyle,
  isProfileLayout,
  isProfileTheme,
} from '@/lib/profileDesign'
import { type Paged, toUserCardData, type UserCardData } from '@/lib/serialize'
import type { User } from '@/payload-types'

import type { FormState } from './auth'

const errorMessage = (err: unknown, fallback: string) => {
  const errors = (err as { data?: { errors?: { field?: string; message?: string }[] } })?.data
    ?.errors
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0]
    if (first.field === 'username') return 'That username is unavailable.'
    return first.message || fallback
  }
  return err instanceof Error ? err.message : fallback
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  const name = String(formData.get('name') ?? '').trim()
  const username = String(formData.get('username') ?? '').trim()
  const bio = String(formData.get('bio') ?? '').trim()
  const website = String(formData.get('website') ?? '').trim()
  const file = formData.get('avatar')
  const coverFile = formData.get('cover')

  let avatarId: number | undefined
  if (file instanceof File && file.size > 0) {
    const media = await payload.create({
      collection: 'media',
      data: { alt: `${username || user.username} avatar` },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        name: file.name,
        size: file.size,
      },
      user,
      overrideAccess: false,
    })
    avatarId = media.id
  }

  let coverId: number | undefined
  if (coverFile instanceof File && coverFile.size > 0) {
    const media = await payload.create({
      collection: 'media',
      data: { alt: `${username || user.username} cover` },
      file: {
        data: Buffer.from(await coverFile.arrayBuffer()),
        mimetype: coverFile.type,
        name: coverFile.name,
        size: coverFile.size,
      },
      user,
      overrideAccess: false,
    })
    coverId = media.id
  }

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        name: name || undefined,
        username: username || undefined,
        bio,
        website,
        ...(avatarId ? { avatar: avatarId } : {}),
        ...(coverId ? { cover: coverId } : {}),
      },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not update your profile.') }
  }

  return { success: true }
}

export async function updateProfileMedia(formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const data: { avatar?: number; cover?: number } = {}

  for (const kind of ['avatar', 'cover'] as const) {
    const file = formData.get(kind)
    if (file instanceof File && file.size > 0) {
      const media = await payload.create({
        collection: 'media',
        data: { alt: `${user.username} ${kind}` },
        file: {
          data: Buffer.from(await file.arrayBuffer()),
          mimetype: file.type,
          name: file.name,
          size: file.size,
        },
        user,
        overrideAccess: false,
      })
      data[kind] = media.id
    }
  }

  if (Object.keys(data).length === 0) return { error: 'No image provided.' }

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data,
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not update your photo.') }
  }

  return { success: true }
}

// Public-profile design (/@username): layout preset, accent palette, and an
// optional full-page background image. Layout/accent are validated against the
// same lists the select fields use; the background uploads like avatar/cover.
export async function updateProfileDesign(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  const layout = formData.get('profileLayout')
  const accent = formData.get('profileAccent')
  const cardStyle = formData.get('profileCardStyle')
  const theme = formData.get('profileTheme')
  const file = formData.get('profileBackground')
  const removeBackground = formData.get('removeBackground') === 'on'

  const data: {
    profileLayout?: User['profileLayout']
    profileAccent?: User['profileAccent']
    profileCardStyle?: User['profileCardStyle']
    profileTheme?: User['profileTheme']
    profileBackground?: number | null
  } = {}

  if (isProfileLayout(layout)) data.profileLayout = layout
  if (isProfileAccent(accent)) data.profileAccent = accent
  if (isProfileCardStyle(cardStyle)) data.profileCardStyle = cardStyle
  if (isProfileTheme(theme)) data.profileTheme = theme

  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith('image/')) return { error: 'Background must be an image.' }
    const media = await payload.create({
      collection: 'media',
      data: { alt: `${user.username} profile background` },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        name: file.name,
        size: file.size,
      },
      user,
      overrideAccess: false,
    })
    data.profileBackground = media.id
  } else if (removeBackground) {
    data.profileBackground = null
  }

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data,
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not update your profile design.') }
  }

  return { success: true }
}

export async function updatePrivacy(data: {
  isPrivate?: boolean
  discoverable?: boolean
  publicProfile?: boolean
  profileViewTracking?: boolean
  commentPermission?: 'everyone' | 'followers' | 'off'
  testimonialPermission?: 'everyone' | 'followers' | 'off'
}): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data,
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not update privacy settings.') }
  }

  return { success: true }
}

export async function updateTheme(theme: 'light' | 'dark' | 'system'): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { theme },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not update theme.') }
  }

  return { success: true }
}

// Composer audience preference — saved per user so the last choice carries
// across browsers and devices.
export async function updateDefaultPostVisibility(
  visibility: 'public' | 'followers',
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { defaultPostVisibility: visibility },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not save your audience preference.') }
  }

  return { success: true }
}

export async function completeOnboarding(next?: string): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { onboardedAt: new Date().toISOString() },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not finish onboarding.') }
  }

  redirect(safeConnectPath(next) ?? '/home')
}

const MAX_ABOUT_BLOCKS = 25

// Rebuilds the user's `about` blocks from editor data. The editor submits a
// JSON payload plus one file field per newly added image block; blocks without
// meaningful content are dropped. Block ids are intentionally not echoed back —
// Payload rewrites the whole blocks array on update.
export async function updateAbout(formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get('about') ?? '[]'))
  } catch {
    return { error: 'Invalid about content.' }
  }
  if (!Array.isArray(raw)) return { error: 'Invalid about content.' }

  const clean = (value: unknown, max: number) =>
    typeof value === 'string' ? value.trim().slice(0, max) : ''

  // Uploads a file field to the media collection, returning the new media id.
  const uploadAboutImage = async (file: FormDataEntryValue | null): Promise<number | null> => {
    if (!(file instanceof File) || file.size === 0 || !file.type.startsWith('image/')) return null
    const media = await payload.create({
      collection: 'media',
      data: { alt: `${user.username} about photo` },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        name: file.name,
        size: file.size,
      },
      user,
      overrideAccess: false,
    })
    return media.id
  }

  const about: Record<string, unknown>[] = []

  for (const entry of raw.slice(0, MAX_ABOUT_BLOCKS)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>

    switch (e.type) {
      case 'section': {
        const heading = clean(e.heading, 120)
        const body = clean(e.body, 5000)
        if (!heading && !body) continue
        about.push({ blockType: 'section', heading, body })
        break
      }
      case 'list': {
        const heading = clean(e.heading, 120)
        // Items arrive as { title, description } objects; bare strings from
        // older editor payloads are treated as title-only.
        const items = (Array.isArray(e.items) ? e.items : [])
          .map((item) =>
            item && typeof item === 'object'
              ? {
                  value: clean(
                    (item as Record<string, unknown>).title ??
                      (item as Record<string, unknown>).value,
                    200,
                  ),
                  description: clean((item as Record<string, unknown>).description, 300),
                }
              : { value: clean(item, 200), description: '' },
          )
          .filter((item) => item.value)
          .slice(0, 30)
        if (!heading && items.length === 0) continue
        about.push({ blockType: 'list', heading, items })
        break
      }
      case 'links': {
        const heading = clean(e.heading, 120)
        const items = (Array.isArray(e.items) ? e.items : [])
          .map((item) =>
            item && typeof item === 'object'
              ? {
                  label: clean((item as Record<string, unknown>).label, 80),
                  url: clean((item as Record<string, unknown>).url, 500),
                }
              : { label: '', url: '' },
          )
          .filter((item) => item.label && item.url)
          .slice(0, 20)
        if (!heading && items.length === 0) continue
        about.push({ blockType: 'links', heading, items })
        break
      }
      case 'image': {
        let mediaId =
          typeof e.mediaId === 'number' && Number.isInteger(e.mediaId) ? e.mediaId : null
        const file =
          typeof e.fileField === 'string' && e.fileField ? formData.get(e.fileField) : null
        const uploaded = await uploadAboutImage(file)
        if (uploaded) mediaId = uploaded
        if (!mediaId) continue
        about.push({ blockType: 'image', image: mediaId, caption: clean(e.caption, 300) })
        break
      }
      case 'embed': {
        const url = clean(e.url, 500)
        if (!url) continue
        about.push({ blockType: 'embed', url, caption: clean(e.caption, 300) })
        break
      }
      case 'details': {
        const heading = clean(e.heading, 120)
        const items = (Array.isArray(e.items) ? e.items : [])
          .map((item) =>
            item && typeof item === 'object'
              ? {
                  label: clean((item as Record<string, unknown>).label, 60),
                  value: clean((item as Record<string, unknown>).value, 160),
                }
              : { label: '', value: '' },
          )
          .filter((item) => item.label && item.value)
          .slice(0, 20)
        if (!heading && items.length === 0) continue
        about.push({ blockType: 'details', heading, items })
        break
      }
      case 'quote': {
        const text = clean(e.text, 500)
        if (!text) continue
        about.push({ blockType: 'quote', text, attribution: clean(e.attribution, 120) })
        break
      }
      case 'stats': {
        const heading = clean(e.heading, 120)
        const items = (Array.isArray(e.items) ? e.items : [])
          .map((item) =>
            item && typeof item === 'object'
              ? {
                  value: clean((item as Record<string, unknown>).value, 40),
                  label: clean((item as Record<string, unknown>).label, 80),
                }
              : { value: '', label: '' },
          )
          .filter((item) => item.value && item.label)
          .slice(0, 8)
        if (!heading && items.length === 0) continue
        about.push({ blockType: 'stats', heading, items })
        break
      }
      case 'gallery': {
        const heading = clean(e.heading, 120)
        const items: Record<string, unknown>[] = []
        for (const item of (Array.isArray(e.items) ? e.items : []).slice(0, 12)) {
          if (!item || typeof item !== 'object') continue
          const it = item as Record<string, unknown>
          let mediaId =
            typeof it.mediaId === 'number' && Number.isInteger(it.mediaId) ? it.mediaId : null
          const file =
            typeof it.fileField === 'string' && it.fileField ? formData.get(it.fileField) : null
          const uploaded = await uploadAboutImage(file)
          if (uploaded) mediaId = uploaded
          if (mediaId) items.push({ image: mediaId, caption: clean(it.caption, 120) })
        }
        if (!heading && items.length === 0) continue
        about.push({ blockType: 'gallery', heading, items })
        break
      }
    }
  }

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { about },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err, 'Could not update your about page.') }
  }

  return { success: true }
}

// "Suggested for you" pool size — the ranked list is paginated out of this
// pool so ordering stays stable while scrolling.
const SUGGESTED_POOL = 60
const SUGGESTED_PAGE_SIZE = 20

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>

// Ids of everyone the viewer follows — suggestion rankings exclude these
// and the viewer from their candidate sets.
async function followedIds(payload: PayloadClient, user: User): Promise<number[]> {
  const follows = await payload.find({
    collection: 'follows',
    where: { follower: { equals: user.id } },
    limit: 0,
    depth: 0,
    user,
    overrideAccess: false,
  })
  return follows.docs.map((follow) =>
    typeof follow.following === 'object' ? follow.following.id : follow.following,
  )
}

// Total incoming follows per user id — the follower-count ranking weight
// shared by the suggestion queries.
async function followerCountsFor(
  payload: PayloadClient,
  user: User,
  ids: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  if (ids.length === 0) return counts
  const incoming = await payload.find({
    collection: 'follows',
    where: { following: { in: ids } },
    limit: 0,
    depth: 0,
    user,
    overrideAccess: false,
  })
  for (const follow of incoming.docs) {
    const id = typeof follow.following === 'object' ? follow.following.id : follow.following
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

// Discoverable members the viewer doesn't follow yet, ranked by follower
// count — powers the Explore people tab when there's no query.
export async function getSuggestedPeople(page = 1): Promise<Paged<UserCardData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const following = await followedIds(payload, user)

  const result = await payload.find({
    collection: 'users',
    where: {
      and: [{ discoverable: { not_equals: false } }, { id: { not_in: [user.id, ...following] } }],
    },
    sort: '-createdAt',
    limit: SUGGESTED_POOL,
    depth: 1,
    user,
    overrideAccess: false,
  })

  const followerCounts = await followerCountsFor(
    payload,
    user,
    result.docs.map((doc) => doc.id),
  )
  const ranked = [...result.docs].sort(
    (a, b) => (followerCounts.get(b.id) ?? 0) - (followerCounts.get(a.id) ?? 0),
  )
  const start = (page - 1) * SUGGESTED_PAGE_SIZE
  const items = ranked.slice(start, start + SUGGESTED_PAGE_SIZE)
  const topBadges = await getTopBadgesForUsers(
    payload,
    items.map((doc) => doc.id),
  )

  return {
    items: items.map((doc: User) =>
      toUserCardData(doc, user, false, followerCounts.get(doc.id) ?? 0, topBadges.get(doc.id)),
    ),
    hasMore: ranked.length > start + items.length,
  }
}

// Friends-of-friends — discoverable users followed by people the viewer
// follows, weighted by mutual count then follower count. Falls back to the
// plain suggestion ranking when the viewer follows nobody or has no
// second-degree candidates.
export async function getPeopleYouMayKnow(page = 1): Promise<Paged<UserCardData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const following = await followedIds(payload, user)
  if (following.length === 0) return getSuggestedPeople(page)

  // Each second-degree follow row is one mutual path to a candidate.
  const secondDegree = await payload.find({
    collection: 'follows',
    where: {
      and: [{ follower: { in: following } }, { following: { not_in: [user.id, ...following] } }],
    },
    limit: 0,
    depth: 0,
    user,
    overrideAccess: false,
  })

  const mutualCounts = new Map<number, number>()
  for (const follow of secondDegree.docs) {
    const id = typeof follow.following === 'object' ? follow.following.id : follow.following
    mutualCounts.set(id, (mutualCounts.get(id) ?? 0) + 1)
  }
  if (mutualCounts.size === 0) return getSuggestedPeople(page)

  const candidateIds = [...mutualCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, SUGGESTED_POOL)
    .map(([id]) => id)

  const result = await payload.find({
    collection: 'users',
    where: {
      and: [{ discoverable: { not_equals: false } }, { id: { in: candidateIds } }],
    },
    limit: SUGGESTED_POOL,
    depth: 1,
    user,
    overrideAccess: false,
  })

  const followerCounts = await followerCountsFor(
    payload,
    user,
    result.docs.map((doc) => doc.id),
  )
  const ranked = [...result.docs].sort(
    (a, b) =>
      (mutualCounts.get(b.id) ?? 0) * 5 +
      (followerCounts.get(b.id) ?? 0) -
      ((mutualCounts.get(a.id) ?? 0) * 5 + (followerCounts.get(a.id) ?? 0)),
  )
  const start = (page - 1) * SUGGESTED_PAGE_SIZE
  const items = ranked.slice(start, start + SUGGESTED_PAGE_SIZE)
  const topBadges = await getTopBadgesForUsers(
    payload,
    items.map((doc) => doc.id),
  )

  return {
    items: items.map((doc: User) =>
      toUserCardData(doc, user, false, followerCounts.get(doc.id) ?? 0, topBadges.get(doc.id)),
    ),
    hasMore: ranked.length > start + items.length,
  }
}

// One fresh suggestion to swap into the Explore rail when a card is followed.
// Pages the same ranked pool as getPeopleYouMayKnow (which already excludes
// the just-followed user) and returns the first candidate not in excludeIds;
// the displayed cards sit at the top of the ranking so this almost always
// resolves within page 1. Capped at 3 pages — the pool is only 60 deep.
export async function getSuggestedReplacement(excludeIds: number[]): Promise<UserCardData | null> {
  const exclude = new Set(excludeIds.filter((id) => Number.isInteger(id)))
  for (let page = 1; page <= 3; page++) {
    const { items, hasMore } = await getPeopleYouMayKnow(page)
    const found = items.find((u) => !exclude.has(u.id))
    if (found) return found
    if (!hasMore) return null
  }
  return null
}

export async function searchUsers(query: string, page = 1): Promise<Paged<UserCardData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const trimmed = query.trim()
  if (!trimmed) return getPeopleYouMayKnow(page)

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'users',
    where: {
      and: [
        { discoverable: { not_equals: false } },
        {
          or: [{ name: { contains: trimmed } }, { username: { contains: trimmed } }],
        },
      ],
    },
    sort: '-createdAt',
    page,
    limit: 20,
    depth: 1,
    user,
    overrideAccess: false,
  })

  const ids = result.docs.map((doc) => doc.id)
  const myFollows = await payload.find({
    collection: 'follows',
    where: {
      and: [{ follower: { equals: user.id } }, { following: { in: ids } }],
    },
    limit: 0,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const followingIds = new Set(
    myFollows.docs.map((follow) =>
      typeof follow.following === 'object' ? follow.following.id : follow.following,
    ),
  )

  const incoming = await payload.find({
    collection: 'follows',
    where: { following: { in: ids } },
    limit: 0,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const followerCounts = new Map<number, number>()
  for (const follow of incoming.docs) {
    const id = typeof follow.following === 'object' ? follow.following.id : follow.following
    followerCounts.set(id, (followerCounts.get(id) ?? 0) + 1)
  }

  const topBadges = await getTopBadgesForUsers(
    payload,
    result.docs.map((doc) => doc.id),
  )

  return {
    items: result.docs.map((doc: User) =>
      toUserCardData(
        doc,
        user,
        followingIds.has(doc.id),
        followerCounts.get(doc.id) ?? 0,
        topBadges.get(doc.id),
      ),
    ),
    hasMore: result.hasNextPage,
  }
}

// Public profile search for the landing page. Anonymous visitors only ever see
// users who explicitly opted in (publicProfile + discoverable), serialized with
// no viewer so no follow state or private fields leak.
export async function searchPublicUsers(query: string): Promise<UserCardData[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'users',
    where: {
      and: [
        { publicProfile: { equals: true } },
        { discoverable: { equals: true } },
        {
          or: [{ name: { contains: trimmed } }, { username: { contains: trimmed } }],
        },
      ],
    },
    sort: '-createdAt',
    limit: 6,
    depth: 1,
  })

  const topBadges = await getTopBadgesForUsers(
    payload,
    result.docs.map((doc) => doc.id),
  )

  return result.docs.map((doc: User) =>
    toUserCardData(doc, null, false, undefined, topBadges.get(doc.id)),
  )
}

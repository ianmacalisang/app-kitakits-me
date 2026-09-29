'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getTopBadgesForUsers } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import { type Paged, type TestimonialData, toTestimonialData } from '@/lib/serialize'

import type { FormState } from './auth'

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong.'

const PAGE_SIZE = 20

const relId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null) return (value as { id: number }).id
  return null
}

const serialize = async (
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  docs: Parameters<typeof toTestimonialData>[0][],
  viewer: Parameters<typeof toTestimonialData>[1],
) => {
  const topBadges = await getTopBadgesForUsers(
    payload,
    docs.map((doc) => relId(doc.author)).filter((id): id is number => id !== null),
  )
  return docs
    .map((doc) => {
      const authorId = relId(doc.author)
      return toTestimonialData(doc, viewer, authorId ? topBadges.get(authorId) : undefined)
    })
    .filter((t): t is TestimonialData => t !== null)
}

// Approved testimonials shown on a profile's Testimonials tab. Signed-out
// callers (public page) get the same approved-only list — callers are
// responsible for only rendering it on public, non-private profiles.
export async function getTestimonials(userId: number, page = 1): Promise<Paged<TestimonialData>> {
  const user = await getCurrentUser()
  const payload = await getPayloadClient()

  const result = await payload.find({
    collection: 'testimonials',
    where: {
      and: [{ recipient: { equals: userId } }, { status: { equals: 'approved' } }],
    },
    sort: '-createdAt',
    page,
    limit: PAGE_SIZE,
    depth: 2,
    ...(user ? { user, overrideAccess: false as const } : {}),
  })

  return { items: await serialize(payload, result.docs, user), hasMore: result.hasNextPage }
}

// The viewer's own testimonial on a profile, whatever its status — drives the
// write/edit/awaiting-approval state of the form in the Testimonials tab.
export async function getMyTestimonialFor(recipientId: number): Promise<TestimonialData | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'testimonials',
    where: {
      and: [{ author: { equals: user.id } }, { recipient: { equals: recipientId } }],
    },
    limit: 1,
    depth: 2,
    user,
    overrideAccess: false,
  })

  const doc = result.docs[0]
  if (!doc) return null
  const authorId = relId(doc.author)
  const topBadges = authorId ? await getTopBadgesForUsers(payload, [authorId]) : null
  return toTestimonialData(doc, user, authorId ? topBadges?.get(authorId) : undefined)
}

// Testimonials addressed to the viewer — 'pending' is the review queue,
// 'resolved' covers approved + declined. Powers the /testimonials page.
export async function getReceivedTestimonials(
  status: 'pending' | 'resolved',
  page = 1,
): Promise<Paged<TestimonialData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'testimonials',
    where: {
      and: [
        { recipient: { equals: user.id } },
        status === 'pending'
          ? { status: { equals: 'pending' } }
          : { status: { not_equals: 'pending' } },
      ],
    },
    // Pending reviews surface oldest-first so nothing sits unanswered.
    sort: status === 'pending' ? 'createdAt' : '-createdAt',
    page,
    limit: PAGE_SIZE,
    depth: 2,
    user,
    overrideAccess: false,
  })

  return { items: await serialize(payload, result.docs, user), hasMore: result.hasNextPage }
}

// Testimonials the viewer wrote for other people, with their live status.
export async function getWrittenTestimonials(page = 1): Promise<Paged<TestimonialData>> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'testimonials',
    where: { author: { equals: user.id } },
    sort: '-createdAt',
    page,
    limit: PAGE_SIZE,
    depth: 2,
    user,
    overrideAccess: false,
  })

  return { items: await serialize(payload, result.docs, user), hasMore: result.hasNextPage }
}

export async function createTestimonial(recipientId: number, content: string): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const trimmed = content.trim()
  if (!trimmed) return { error: 'Testimonial cannot be empty.' }

  const payload = await getPayloadClient()

  const recipient = await payload
    .findByID({
      collection: 'users',
      id: recipientId,
      depth: 0,
      user,
      overrideAccess: false,
    })
    .catch(() => null)
  if (!recipient) return { error: 'User not found.' }
  if (recipient.testimonialPermission === 'off') {
    return { error: `@${recipient.username} isn't accepting testimonials.` }
  }

  try {
    await payload.create({
      collection: 'testimonials',
      data: { author: user.id, recipient: recipientId, content: trimmed },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

export async function updateTestimonial(
  testimonialId: number,
  content: string,
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const trimmed = content.trim()
  if (!trimmed) return { error: 'Testimonial cannot be empty.' }

  const payload = await getPayloadClient()

  try {
    await payload.update({
      collection: 'testimonials',
      id: testimonialId,
      data: { content: trimmed },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

export async function deleteTestimonial(testimonialId: number): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  try {
    await payload.delete({
      collection: 'testimonials',
      id: testimonialId,
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

export async function setTestimonialStatus(
  testimonialId: number,
  status: 'approved' | 'rejected',
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  try {
    await payload.update({
      collection: 'testimonials',
      id: testimonialId,
      data: { status },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

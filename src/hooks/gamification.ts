import type { CollectionAfterChangeHook, CollectionBeforeDeleteHook, PayloadRequest } from 'payload'

import { revalidateNavCounts } from '../lib/nav-cache'
import { applyPointEvent, awardPoints, evaluateBadges } from '../lib/gamification'

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'object' && value !== null) {
    const id = Number((value as { id: number | string }).id)
    return Number.isFinite(id) ? id : null
  }
  return null
}

const postAuthorId = async (req: PayloadRequest, postId: number) => {
  const post = await req.payload.findByID({ collection: 'posts', id: postId, depth: 0, req })
  return post ? idOf(post.author) : null
}

// posts: author earns for posting; a repost also pays the ORIGINAL author.
export const postPoints: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return

  const authorId = idOf(doc.author)
  await awardPoints(
    { payload: req.payload, req },
    { userId: authorId, kind: 'post', key: `post:${doc.id}`, postId: doc.id },
  )

  const sharedPostId = idOf(doc.sharedPost)
  if (sharedPostId) {
    const targetAuthorId = await postAuthorId(req, sharedPostId)
    if (targetAuthorId && targetAuthorId !== authorId) {
      await awardPoints(
        { payload: req.payload, req },
        {
          userId: targetAuthorId,
          kind: 'share-received',
          key: `share:${sharedPostId}:${authorId}`,
          postId: sharedPostId,
        },
      )
    }
  }
}

// comments: the commenter earns for writing; the post author earns for
// receiving one. Self-comments only pay the writing side.
export const commentPoints: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return

  const authorId = idOf(doc.author)
  const postId = idOf(doc.post)
  await awardPoints(
    { payload: req.payload, req },
    { userId: authorId, kind: 'comment', key: `comment:${doc.id}`, postId },
  )

  if (postId) {
    const recipientId = await postAuthorId(req, postId)
    if (recipientId && recipientId !== authorId) {
      await awardPoints(
        { payload: req.payload, req },
        {
          userId: recipientId,
          kind: 'comment-received',
          key: `comment-received:${doc.id}`,
          postId,
        },
      )
    }
  }
}

export const likePoints: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return

  const actorId = idOf(doc.user)
  const postId = idOf(doc.post)
  if (!postId) return

  const recipientId = await postAuthorId(req, postId)
  // `like:{post}:{liker}` — deleting the like and re-liking hits the dedupe
  // key, so the author can't be farmed.
  if (recipientId && recipientId !== actorId) {
    await awardPoints(
      { payload: req.payload, req },
      {
        userId: recipientId,
        kind: 'like-received',
        key: `like:${postId}:${actorId}`,
        postId,
      },
    )
  }
}

export const savePoints: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return

  const actorId = idOf(doc.user)
  const postId = idOf(doc.post)
  if (!postId) return

  const recipientId = await postAuthorId(req, postId)
  if (recipientId && recipientId !== actorId) {
    await awardPoints(
      { payload: req.payload, req },
      {
        userId: recipientId,
        kind: 'save-received',
        key: `save:${postId}:${actorId}`,
        postId,
      },
    )
  }
}

export const followPoints: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return

  const followerId = idOf(doc.follower)
  const followingId = idOf(doc.following)
  await awardPoints(
    { payload: req.payload, req },
    {
      userId: followingId,
      kind: 'follow-received',
      key: `follow:${followerId}:${followingId}`,
    },
  )
}

// Approval pays both sides — the recipient gains the testimonial, the author
// is rewarded for writing something that made it live.
export const testimonialPoints: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  // Fires when a testimonial becomes approved — on create (admins can create
  // pre-approved) or on the pending/rejected → approved transition.
  const newlyApproved =
    doc.status === 'approved' && (operation === 'create' || previousDoc?.status !== 'approved')
  if (!newlyApproved) return

  const recipientId = idOf(doc.recipient)
  const authorId = idOf(doc.author)
  await awardPoints(
    { payload: req.payload, req },
    { userId: recipientId, kind: 'testimonial-received', key: `testimonial:${doc.id}` },
  )
  await awardPoints(
    { payload: req.payload, req },
    { userId: authorId, kind: 'testimonial-given', key: `testimonial-given:${doc.id}` },
  )
}

// The profile-complete badge is the only rule driven by user doc edits —
// evaluate when an update first leaves the user with an avatar AND a bio.
export const profileBadgeCheck: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  if (operation !== 'update') return
  const complete = Boolean(doc.avatar) && Boolean((doc.bio ?? '').trim())
  const wasComplete = Boolean(previousDoc?.avatar) && Boolean((previousDoc?.bio ?? '').trim())
  if (!complete || wasComplete) return

  await evaluateBadges({ payload: req.payload, req }, doc.id)
}

// point-events: a committed ledger row bumps the user's balance and
// re-evaluates their badges. Runs for hook-driven awards AND direct admin
// inserts ('manual' adjustments), so the balance never drifts.
export const pointEventApplied: CollectionAfterChangeHook = async ({ doc, req, operation }) => {
  if (operation !== 'create') return
  await applyPointEvent({ payload: req.payload, req }, doc)
}

// Users beforeDelete — sweeps gamification rows on EVERY user delete path
// (admin panel, tests, the delete-account cascade). Without this the FK
// SET NULL on point_events.user_id/user_badges.user_id hits NOT NULL and
// rejects the delete.
export const deleteGamificationData: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'point-events',
    where: { user: { equals: id } },
    req,
  })
  await req.payload.delete({
    collection: 'user-badges',
    where: { user: { equals: id } },
    req,
  })
}

// Every user-badges insert (auto-grant or manual admin award) notifies the
// recipient. Backfills pass context.skipNotification to stay silent.
export const badgeAwardNotification: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
  context,
}) => {
  if (operation !== 'create' || context?.skipNotification) return

  const userId = idOf(doc.user)
  const badgeId = idOf(doc.badge)
  if (!userId || !badgeId) return

  try {
    await req.payload.create({
      collection: 'notifications',
      // Actor is the recipient themself — badge rows have no external actor,
      // and the notifications feed renders it as "You earned the X badge".
      data: { recipient: userId, actor: userId, type: 'badge', badge: badgeId },
      req,
    })
    revalidateNavCounts(userId)
  } catch (err) {
    req.payload.logger.error({ err, msg: 'Badge notification failed', userId, badgeId })
  }
}

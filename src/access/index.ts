import { cache } from 'react'

import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'

// Boolean-only variant for spots that don't accept Where queries (e.g. `access.admin`).
export const isAdminUser = ({ req }: { req: PayloadRequest }): boolean => req.user?.role === 'admin'

export const isAdmin: Access = ({ req }) => req.user?.role === 'admin'

export const isAdminField: FieldAccess = ({ req }) => req.user?.role === 'admin'

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

// Users can update/delete their own document; admins can do anything.
// `field` is the relationship field on the doc that holds the owner (e.g. 'author', 'follower').
export const isOwnerOrAdmin =
  (field: string): Access =>
  ({ req }) => {
    const user = req.user
    if (!user) return false
    if (user.role === 'admin') return true
    return {
      [field]: { equals: user.id },
    }
  }

// Strict owner-only variant — even admins can't update/delete others' docs.
export const isOwner =
  (field: string): Access =>
  ({ req }) => {
    const user = req.user
    if (!user) return false
    return {
      [field]: { equals: user.id },
    }
  }

// For the Users collection itself: users can update their own doc, admins can update any.
export const isSelfOrAdmin: Access = ({ req }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  return {
    id: { equals: user.id },
  }
}

// IDs of every user the viewer follows, deduped per request via React cache —
// a single page render or action can trigger several access checks that would
// otherwise each re-run this query. Keyed on (payload, userId) because req
// objects differ between Local API calls in the same request.
// Capped at 2000 (the feed's followee ceiling) so the generated IN() clause
// stays bounded instead of scaling with the user's social graph.
const followedIdsByUser = cache(
  async (payload: PayloadRequest['payload'], userId: number): Promise<number[]> => {
    const follows = await payload.find({
      collection: 'follows',
      where: { follower: { equals: userId } },
      limit: 2000,
      depth: 0,
      overrideAccess: true,
    })
    return follows.docs.map((follow) =>
      typeof follow.following === 'object' ? follow.following.id : follow.following,
    )
  },
)

const followedIds = (req: PayloadRequest): Promise<number[]> =>
  req.user ? followedIdsByUser(req.payload, req.user.id) : Promise.resolve([])

const findPost = async (req: PayloadRequest, postRef: unknown) => {
  const postId =
    typeof postRef === 'object' && postRef !== null ? (postRef as { id: number }).id : postRef
  if (typeof postId !== 'number') return null
  return req.payload.findByID({ collection: 'posts', id: postId, depth: 1, req })
}

const isAuthorOrFollower = async (req: PayloadRequest, authorId: number): Promise<boolean> => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin' || user.id === authorId) return true
  const follow = await req.payload.count({
    collection: 'follows',
    where: {
      and: [{ follower: { equals: user.id } }, { following: { equals: authorId } }],
    },
    req,
  })
  return follow.totalDocs > 0
}

// Posts are public unless marked followers-only or the author's account is
// private — then only the author, their followers, and admins can read them.
export const canReadPosts: Access = async ({ req }) => {
  const user = req.user
  if (user?.role === 'admin') return true

  const publicPosts: Where = {
    and: [
      { 'author.isPrivate': { not_equals: true } },
      { visibility: { not_equals: 'followers' } },
    ],
  }
  if (!user) return publicPosts

  const allowed = [user.id, ...(await followedIds(req))]
  return { or: [publicPosts, { author: { in: allowed } }] }
}

// Comments inherit visibility from their parent post.
export const canReadComments: Access = async ({ req }) => {
  const user = req.user
  if (user?.role === 'admin') return true

  const publicComments: Where = {
    and: [
      { 'post.author.isPrivate': { not_equals: true } },
      { 'post.visibility': { not_equals: 'followers' } },
    ],
  }
  if (!user) return publicComments

  const allowed = [user.id, ...(await followedIds(req))]
  return { or: [publicComments, { 'post.author': { in: allowed } }] }
}

// Post owners control who can comment via commentPermission; followers-only
// and private-account posts also require a follow regardless of that setting.
export const canComment: Access = async ({ req, data }) => {
  const user = req.user
  if (!user) return false

  const post = await findPost(req, data?.post)
  const author =
    post && typeof post.author === 'object' && post.author !== null ? post.author : null
  if (!post || !author) return false
  if (author.id === user.id) return true

  const permission = author.commentPermission ?? 'everyone'
  if (permission === 'off') return false

  const restricted =
    permission === 'followers' || post.visibility === 'followers' || Boolean(author.isPrivate)
  if (!restricted) return true
  return isAuthorOrFollower(req, author.id)
}

// You can't like a post you can't see.
export const canLike: Access = async ({ req, data }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true

  const post = await findPost(req, data?.post)
  const author =
    post && typeof post.author === 'object' && post.author !== null ? post.author : null
  if (!post || !author) return false
  if (author.id === user.id) return true
  if (post.visibility !== 'followers' && !author.isPrivate) return true
  return isAuthorOrFollower(req, author.id)
}

const relIdOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'object' && value !== null) {
    return Number((value as { id: number | string }).id)
  }
  return null
}

// Writing a testimonial is gated by the recipient's testimonialPermission —
// 'off' blocks everyone, and 'followers' (or a private account) requires the
// writer to follow the recipient, matching the comment rules.
export const canWriteTestimonial: Access = async ({ req, data }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true

  const recipientId = relIdOf(data?.recipient)
  if (!recipientId || recipientId === user.id) return false

  const recipient = await req.payload.findByID({
    collection: 'users',
    id: recipientId,
    depth: 0,
    req,
  })
  if (!recipient) return false

  const permission = recipient.testimonialPermission ?? 'everyone'
  if (permission === 'off') return false
  if (permission !== 'followers' && !recipient.isPrivate) return true
  return isAuthorOrFollower(req, recipient.id)
}

// Approved testimonials follow the recipient's profile visibility (private
// profiles only show to followers); pending/rejected ones stay between the
// author and recipient. Anonymous readers only ever see approved testimonials
// on public, non-private profiles.
export const canReadTestimonials: Access = async ({ req }) => {
  const user = req.user
  if (user?.role === 'admin') return true

  const anonymousConstraint: Where = {
    and: [
      { status: { equals: 'approved' } },
      { 'recipient.isPrivate': { not_equals: true } },
      { 'recipient.publicProfile': { equals: true } },
    ],
  }
  if (!user) return anonymousConstraint

  const allowed = [user.id, ...(await followedIds(req))]
  const approvedVisible: Where = {
    and: [
      { status: { equals: 'approved' } },
      { or: [{ 'recipient.isPrivate': { not_equals: true } }, { recipient: { in: allowed } }] },
    ],
  }
  const constraints: Where[] = [
    { author: { equals: user.id } },
    { recipient: { equals: user.id } },
    approvedVisible,
  ]
  return { or: constraints }
}

// Both parties can reach the document (edit content / change status / remove
// it); field-level access decides which fields each party may touch.
export const isTestimonialParty: Access = ({ req }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  const constraint: Where = {
    or: [{ author: { equals: user.id } }, { recipient: { equals: user.id } }],
  }
  return constraint
}

// Only the testimonial's author (or an admin) may edit its content.
export const isTestimonialAuthorField: FieldAccess = ({ req, doc }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  return relIdOf(doc?.author) === user.id
}

// Only the recipient (or an admin) may approve/reject a testimonial.
export const isTestimonialRecipientField: FieldAccess = ({ req, doc }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true
  return relIdOf(doc?.recipient) === user.id
}

// Saving follows the same visibility rule as liking, plus you can't save
// your own post.
export const canSave: Access = async ({ req, data }) => {
  const user = req.user
  if (!user) return false
  if (user.role === 'admin') return true

  const post = await findPost(req, data?.post)
  const author =
    post && typeof post.author === 'object' && post.author !== null ? post.author : null
  if (!post || !author || author.id === user.id) return false
  if (post.visibility !== 'followers' && !author.isPrivate) return true
  return isAuthorOrFollower(req, author.id)
}

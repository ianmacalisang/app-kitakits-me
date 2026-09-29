'use server'

import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { getTopBadgesForUsers } from '@/lib/gamification'
import { getPayloadClient } from '@/lib/payload'
import { type CommentData, type Paged, toCommentData } from '@/lib/serialize'

import type { FormState } from './auth'

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong.'

export async function getComments(
  postId: number,
  page = 1,
): Promise<Paged<CommentData> & { commentsDisabled: boolean }> {
  const user = await getCurrentUser()

  const payload = await getPayloadClient()
  const post = await payload.findByID({ collection: 'posts', id: postId, depth: 1 })
  const author = typeof post.author === 'object' && post.author !== null ? post.author : null
  const commentsDisabled = author?.commentPermission === 'off' && author.id !== user?.id

  const comments = await payload.find({
    collection: 'comments',
    // Signed-out readers get the anonymous canReadComments constraint inline —
    // default access so comment authors still populate for display.
    where: user
      ? { post: { equals: postId } }
      : {
          and: [
            { post: { equals: postId } },
            { 'post.author.isPrivate': { not_equals: true } },
            { 'post.visibility': { not_equals: 'followers' } },
          ],
        },
    sort: 'createdAt',
    page,
    limit: 30,
    depth: 2,
    ...(user ? { user, overrideAccess: false as const } : {}),
  })

  const topBadges = await getTopBadgesForUsers(
    payload,
    comments.docs.map((comment) =>
      typeof comment.author === 'object' && comment.author !== null
        ? comment.author.id
        : Number(comment.author),
    ),
  )

  return {
    items: comments.docs.map((comment) =>
      toCommentData(
        comment,
        user,
        topBadges.get(
          typeof comment.author === 'object' && comment.author !== null
            ? comment.author.id
            : Number(comment.author),
        ),
      ),
    ),
    hasMore: comments.hasNextPage,
    commentsDisabled,
  }
}

export async function createComment(postId: number, content: string): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const trimmed = content.trim()
  if (!trimmed) return { error: 'Comment cannot be empty.' }

  const payload = await getPayloadClient()

  try {
    await payload.create({
      collection: 'comments',
      data: { post: postId, author: user.id, content: trimmed },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

export async function updateComment(commentId: number, content: string): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const trimmed = content.trim()
  if (!trimmed) return { error: 'Comment cannot be empty.' }

  const payload = await getPayloadClient()

  try {
    await payload.update({
      collection: 'comments',
      id: commentId,
      data: { content: trimmed },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

export async function deleteComment(commentId: number): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getPayloadClient()

  try {
    await payload.delete({
      collection: 'comments',
      id: commentId,
      user,
      overrideAccess: false,
    })
  } catch (err) {
    return { error: errorMessage(err) }
  }

  return { success: true }
}

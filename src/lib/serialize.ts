import type {
  Badge,
  Comment,
  MailAttachment,
  MailDraft,
  Media,
  Message,
  Notification,
  Post,
  Testimonial,
  Thread,
  User,
  Video,
} from '@/payload-types'

import { streamHostname } from './bunny'
import { type PostCategory, isPostCategory } from './categories'
import { toCdnUrl } from './cdn'
import { levelForPoints, type LevelInfo } from './levels'

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const relId = (value: unknown): number | null => {
  if (isObj(value)) return (value as { id: number }).id
  return typeof value === 'number' ? value : null
}

export function avatarUrl(user: User): string | undefined {
  if (!isObj(user.avatar)) return undefined
  return toCdnUrl((user.avatar as Media).url)
}

export function coverUrl(user: User): string | undefined {
  if (!isObj(user.cover)) return undefined
  return toCdnUrl((user.cover as Media).url)
}

export function mediaUrl(media: Media | number | null | undefined) {
  if (!isObj(media)) return undefined
  return toCdnUrl((media as Media).url)
}

// Feed media filter — 'all' shows everything, 'media' requires at least one
// image or video attachment, 'images'/'videos' require that specific kind.
export type MediaFilter = 'all' | 'media' | 'images' | 'videos'

export interface Paged<T> {
  items: T[]
  hasMore: boolean
}

// Video on a post card — lives on Bunny Stream; URLs derive from the guid.
export interface PostVideoData {
  id: number
  status: 'processing' | 'ready' | 'failed'
  hlsUrl: string
  thumbnailUrl: string
  duration: number | null
  aspectRatio: number | null
  playCount: number
}

export function toVideoData(video: Video): PostVideoData {
  const host = streamHostname()
  const { bunnyVideoId, width, height } = video
  return {
    id: video.id,
    status:
      video.status === 'ready' ? 'ready' : video.status === 'failed' ? 'failed' : 'processing',
    hlsUrl: host ? `${host}/${bunnyVideoId}/playlist.m3u8` : '',
    thumbnailUrl: host ? `${host}/${bunnyVideoId}/thumbnail_3.jpg` : '',
    duration: video.duration ?? null,
    aspectRatio: width && height ? width / height : null,
    playCount: video.playCount ?? 0,
  }
}

// The original post embedded inside a share — read-only display data.
export interface EmbeddedPostData {
  id: number
  authorId: number
  content: string | null
  imageUrls: string[]
  video?: PostVideoData
  category: PostCategory
  createdAt: string
  authorName: string
  authorUsername: string
  authorAvatarUrl?: string
  authorBadge?: BadgeData
}

export interface PostCardData {
  id: number
  content: string | null
  images: { id: number; url: string }[]
  video?: PostVideoData
  createdAt: string
  authorName: string
  authorUsername: string
  authorAvatarUrl?: string
  authorBadge?: BadgeData
  likeCount: number
  commentCount: number
  likedByMe: boolean
  likers: { name: string; username: string; avatarUrl?: string }[]
  latestComments: {
    authorName: string
    authorUsername: string
    authorAvatarUrl?: string
    authorBadge?: BadgeData
    content: string
  }[]
  shareCount: number
  sharedByMe: boolean
  sharedPost?: EmbeddedPostData
  savedByMe: boolean
  saveCount: number
  pinned: boolean
  category: PostCategory | null
  canEdit: boolean
  canShare: boolean
  commentsDisabled: boolean
  viewerAuthenticated: boolean
  visibility: 'public' | 'followers'
}

export interface PostCardExtras {
  likeCount: number
  commentCount: number
  authorBadge?: BadgeData
  likedByMe: boolean
  likers?: PostCardData['likers']
  latestComments?: PostCardData['latestComments']
  shareCount?: number
  sharedByMe?: boolean
  sharedPost?: EmbeddedPostData
  savedByMe?: boolean
  saveCount?: number
}

export function toPostCardData(
  post: Post,
  viewer: User | null,
  {
    likeCount,
    commentCount,
    authorBadge,
    likedByMe,
    likers = [],
    latestComments = [],
    shareCount = 0,
    sharedByMe = false,
    sharedPost,
    savedByMe = false,
    saveCount = 0,
  }: PostCardExtras,
): PostCardData {
  const author = post.author as User
  const images = (Array.isArray(post.image) ? post.image : [])
    .filter((m): m is Media => isObj(m))
    .map((m) => ({ id: m.id, url: mediaUrl(m) }))
    .filter((i): i is { id: number; url: string } => Boolean(i.url))

  return {
    id: post.id,
    content: post.content ?? null,
    images,
    video: isObj(post.video) ? toVideoData(post.video as Video) : undefined,
    createdAt: post.createdAt,
    authorName: author.name,
    authorUsername: author.username,
    authorAvatarUrl: avatarUrl(author),
    authorBadge,
    likeCount,
    commentCount,
    likedByMe,
    likers,
    latestComments,
    shareCount,
    sharedByMe,
    sharedPost,
    savedByMe,
    saveCount,
    pinned: Boolean(post.pinned),
    category: isPostCategory(post.category) ? post.category : 'kwento',
    canEdit: viewer !== null && author.id === viewer.id,
    viewerAuthenticated: viewer !== null,
    // Reposts target the embedded original when present; your own posts and
    // your own share cards can't be reposted.
    canShare:
      viewer !== null &&
      post.visibility === 'public' &&
      author.id !== viewer.id &&
      (sharedPost?.authorId ?? author.id) !== viewer.id,
    visibility: post.visibility === 'followers' ? 'followers' : 'public',
    // The author can still comment on their own post when comments are off.
    commentsDisabled: author.commentPermission === 'off' && author.id !== viewer?.id,
  }
}

// Serialized form of a user's `about` blocks — safe to pass to client
// components and back to the updateAbout action.
export type AboutBlockData =
  | { key: string; id?: string; type: 'section'; heading: string; body: string }
  | {
      key: string
      id?: string
      type: 'list'
      heading: string
      items: { title: string; description: string }[]
    }
  | {
      key: string
      id?: string
      type: 'links'
      heading: string
      items: { label: string; url: string }[]
    }
  | {
      key: string
      id?: string
      type: 'image'
      mediaId: number | null
      url?: string
      caption: string
    }
  | { key: string; id?: string; type: 'embed'; url: string; caption: string }
  | {
      key: string
      id?: string
      type: 'details'
      heading: string
      items: { label: string; value: string }[]
    }
  | { key: string; id?: string; type: 'quote'; text: string; attribution: string }
  | {
      key: string
      id?: string
      type: 'stats'
      heading: string
      items: { value: string; label: string }[]
    }
  | {
      key: string
      id?: string
      type: 'gallery'
      heading: string
      items: { mediaId: number | null; url?: string; caption: string }[]
    }

export function toAboutBlocks(user: User): AboutBlockData[] {
  if (!Array.isArray(user.about)) return []

  return user.about.flatMap((block, index): AboutBlockData[] => {
    const key = block.id ?? `block-${index}`
    switch (block.blockType) {
      case 'section': {
        const heading = (block.heading ?? '').trim()
        const body = (block.body ?? '').trim()
        if (!heading && !body) return []
        return [
          {
            key,
            id: block.id ?? undefined,
            type: 'section',
            heading,
            body,
          },
        ]
      }
      case 'list': {
        const items = (block.items ?? [])
          .map((item) => ({
            title: (item.value ?? '').trim(),
            description: (item.description ?? '').trim(),
          }))
          .filter((item) => item.title)
        const heading = (block.heading ?? '').trim()
        if (!heading && items.length === 0) return []
        return [{ key, id: block.id ?? undefined, type: 'list', heading, items }]
      }
      case 'links': {
        const items = (block.items ?? [])
          .map((item) => ({
            label: (item.label ?? '').trim(),
            url: (item.url ?? '').trim(),
          }))
          .filter((item) => item.label && item.url)
        const heading = (block.heading ?? '').trim()
        if (!heading && items.length === 0) return []
        return [{ key, id: block.id ?? undefined, type: 'links', heading, items }]
      }
      case 'image': {
        const url = mediaUrl(block.image)
        if (!url) return []
        const mediaId = relId(block.image)
        return [
          {
            key,
            id: block.id ?? undefined,
            type: 'image',
            mediaId,
            url,
            caption: (block.caption ?? '').trim(),
          },
        ]
      }
      case 'embed': {
        const url = (block.url ?? '').trim()
        if (!url) return []
        return [
          {
            key,
            id: block.id ?? undefined,
            type: 'embed',
            url,
            caption: (block.caption ?? '').trim(),
          },
        ]
      }
      case 'details': {
        const items = (block.items ?? [])
          .map((item) => ({
            label: (item.label ?? '').trim(),
            value: (item.value ?? '').trim(),
          }))
          .filter((item) => item.label && item.value)
        const heading = (block.heading ?? '').trim()
        if (!heading && items.length === 0) return []
        return [{ key, id: block.id ?? undefined, type: 'details', heading, items }]
      }
      case 'quote': {
        const text = (block.text ?? '').trim()
        if (!text) return []
        return [
          {
            key,
            id: block.id ?? undefined,
            type: 'quote',
            text,
            attribution: (block.attribution ?? '').trim(),
          },
        ]
      }
      case 'stats': {
        const items = (block.items ?? [])
          .map((item) => ({
            value: (item.value ?? '').trim(),
            label: (item.label ?? '').trim(),
          }))
          .filter((item) => item.value && item.label)
        const heading = (block.heading ?? '').trim()
        if (!heading && items.length === 0) return []
        return [{ key, id: block.id ?? undefined, type: 'stats', heading, items }]
      }
      case 'gallery': {
        const items = (block.items ?? []).flatMap((item) => {
          const url = mediaUrl(item.image)
          if (!url) return []
          return [
            {
              mediaId: relId(item.image),
              url,
              caption: (item.caption ?? '').trim(),
            },
          ]
        })
        const heading = (block.heading ?? '').trim()
        if (!heading && items.length === 0) return []
        return [{ key, id: block.id ?? undefined, type: 'gallery', heading, items }]
      }
      default:
        return []
    }
  })
}

// One earned badge as rendered on a profile — flattened from the award row
// and its badge definition.
export interface BadgeData {
  slug: string
  name: string
  description: string | null
  icon: string
  tier: 'bronze' | 'silver' | 'gold'
  awardedAt: string
}

// One badge definition as rendered on the profile progress panel — `earned`
// awards render a full bar; unearned ones show current/required progress.
// `required` is null for manual (admin-granted) badges.
export interface BadgeProgressData {
  slug: string
  name: string
  description: string | null
  icon: string
  tier: 'bronze' | 'silver' | 'gold'
  earned: boolean
  awardedAt: string | null
  current: number
  required: number | null
  unit: string
}

export interface GamificationData {
  points: number
  level: LevelInfo
  badges: BadgeData[]
}

export interface UserCardData {
  id: number
  name: string
  username: string
  bio: string | null
  avatarUrl?: string
  coverUrl?: string
  isFollowing: boolean
  isSelf: boolean
  followerCount?: number
  points: number
  level: LevelInfo
  topBadge?: BadgeData
}

export function toUserCardData(
  user: User,
  viewer: User | null,
  isFollowing: boolean,
  followerCount?: number,
  topBadge?: BadgeData,
): UserCardData {
  const points = user.points ?? 0
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    bio: user.bio ?? null,
    avatarUrl: avatarUrl(user),
    coverUrl: coverUrl(user),
    isFollowing,
    isSelf: user.id === viewer?.id,
    followerCount,
    points,
    level: levelForPoints(points),
    topBadge,
  }
}

export interface CommentData {
  id: number
  content: string
  createdAt: string
  authorName: string
  authorUsername: string
  authorAvatarUrl?: string
  authorBadge?: BadgeData
  canEdit: boolean
}

export function toCommentData(
  comment: Comment,
  viewer: User | null,
  authorBadge?: BadgeData,
): CommentData {
  const author = comment.author as User
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    authorName: author.name,
    authorUsername: author.username,
    authorAvatarUrl: avatarUrl(author),
    authorBadge,
    canEdit: viewer !== null && author.id === viewer.id,
  }
}

export interface TestimonialData {
  id: number
  content: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  authorId: number
  authorName: string
  authorUsername: string
  authorAvatarUrl?: string
  authorBadge?: BadgeData
  recipientId: number
  recipientName: string
  recipientUsername: string
  recipientAvatarUrl?: string
  canEdit: boolean
  canModerate: boolean
}

export function toTestimonialData(
  testimonial: Testimonial,
  viewer: User | null,
  authorBadge?: BadgeData,
): TestimonialData | null {
  const author = isObj(testimonial.author) ? (testimonial.author as User) : null
  const recipient = isObj(testimonial.recipient) ? (testimonial.recipient as User) : null
  if (!author || !recipient) return null

  return {
    id: testimonial.id,
    content: testimonial.content,
    status:
      testimonial.status === 'approved' || testimonial.status === 'rejected'
        ? testimonial.status
        : 'pending',
    createdAt: testimonial.createdAt,
    authorId: author.id,
    authorName: author.name,
    authorUsername: author.username,
    authorAvatarUrl: avatarUrl(author),
    authorBadge,
    recipientId: recipient.id,
    recipientName: recipient.name,
    recipientUsername: recipient.username,
    recipientAvatarUrl: avatarUrl(recipient),
    canEdit: viewer !== null && author.id === viewer.id,
    canModerate: viewer !== null && recipient.id === viewer.id,
  }
}

export interface NotificationData {
  id: number
  type: 'like' | 'comment' | 'follow' | 'testimonial' | 'badge'
  read: boolean
  createdAt: string
  actorName: string
  actorUsername: string
  actorAvatarUrl?: string
  actorBadge?: BadgeData
  postId?: number
  postSnippet?: string
  commentSnippet?: string
  testimonialSnippet?: string
  // 'received' — the actor wrote you a testimonial (awaiting your approval);
  // 'approved' — the actor approved one you wrote.
  testimonialEvent?: 'received' | 'approved'
  // Set on type 'badge' — the definition that was granted. The "actor" on a
  // badge notification is the recipient themself.
  badgeName?: string
  badgeIcon?: string
  badgeTier?: 'bronze' | 'silver' | 'gold'
}

export const snippet = (value: unknown): string | undefined => {
  if (!isObj(value)) return undefined
  const content = (value as { content?: string | null }).content
  if (!content) return undefined
  const text = content.replace(/\s+/g, ' ').trim()
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

export function toNotificationData(
  notification: Notification,
  actorBadge?: BadgeData,
): NotificationData | null {
  const actor = notification.actor
  if (!isObj(actor)) return null

  // The actor being the testimonial's author means "they wrote you one";
  // otherwise the actor is the recipient who approved yours.
  const testimonial = notification.testimonial
  const testimonialEvent = isObj(testimonial)
    ? relId((testimonial as Testimonial).author) === actor.id
      ? 'received'
      : 'approved'
    : undefined

  const badge = isObj(notification.badge) ? (notification.badge as Badge) : null

  return {
    id: notification.id,
    type: notification.type,
    read: Boolean(notification.read),
    createdAt: notification.createdAt,
    actorName: (actor as User).name,
    actorUsername: (actor as User).username,
    actorAvatarUrl: avatarUrl(actor as User),
    actorBadge,
    postId: relId(notification.post) ?? undefined,
    postSnippet: snippet(notification.post),
    commentSnippet: snippet(notification.comment),
    testimonialSnippet: snippet(notification.testimonial),
    testimonialEvent,
    badgeName: badge?.name,
    badgeIcon: badge?.icon ?? undefined,
    badgeTier:
      badge?.tier === 'silver' || badge?.tier === 'gold'
        ? badge.tier
        : badge
          ? 'bronze'
          : undefined,
  }
}

// One row in the home Activities tab — something a followed user did, or an
// opted-in member viewing the feed owner's profile.
// Which fields are populated depends on `type`: post fields for like/comment,
// target fields for follow/testimonial.
export interface ActivityData {
  id: string
  type: 'like' | 'comment' | 'follow' | 'testimonial' | 'badge' | 'profile_view'
  createdAt: string
  actorName: string
  actorUsername: string
  actorAvatarUrl?: string
  actorBadge?: BadgeData
  // The badge the actor earned — only set on 'badge' activities.
  badgeEarned?: BadgeData
  postId?: number
  postSnippet?: string
  postAuthorName?: string
  postAuthorUsername?: string
  postAuthorBadge?: BadgeData
  commentSnippet?: string
  testimonialSnippet?: string
  // The fully hydrated post card for like/comment rows — the row renders the
  // whole post inline, not just the snippet.
  post?: PostCardData
  targetName?: string
  targetUsername?: string
  targetAvatarUrl?: string
  targetBadge?: BadgeData
}

export interface ThreadData {
  id: number
  subject: string
  snippet: string | null
  lastMessageAt: string | null
  createdAt: string
  unread: boolean
  sentByMe: boolean
  messageCount: number
  otherName: string
  otherUsername: string
  otherAvatarUrl?: string
  otherBadge?: BadgeData
  isGuest: boolean
  guestContact: string | null
}

export function toThreadData(
  thread: Thread,
  viewer: User,
  topBadges?: Map<number, BadgeData>,
): ThreadData | null {
  const participants = Array.isArray(thread.participants) ? thread.participants : []
  const other = participants.filter((p): p is User => isObj(p)).find((p) => p.id !== viewer.id)
  // Guest threads hold a single participant (the recipient) — the sender's
  // identity lives on guestName/guestContact instead.
  const guestName = typeof thread.guestName === 'string' ? thread.guestName.trim() : ''
  if (!other && !guestName) return null

  const unreadFor = Array.isArray(thread.unreadFor) ? thread.unreadFor : []

  return {
    id: thread.id,
    subject: thread.subject,
    snippet: thread.lastSnippet ?? null,
    lastMessageAt: thread.lastMessageAt ?? null,
    createdAt: thread.createdAt,
    unread: unreadFor.some((p) => relId(p) === viewer.id),
    sentByMe: relId(thread.lastSender) === viewer.id,
    messageCount: thread.messageCount ?? 0,
    otherName: other?.name ?? guestName,
    otherUsername: other?.username ?? '',
    otherAvatarUrl: other ? avatarUrl(other) : undefined,
    otherBadge: other ? topBadges?.get(other.id) : undefined,
    isGuest: !other,
    guestContact: !other ? (thread.guestContact ?? null) : null,
  }
}

export interface DraftData {
  id: number
  to: string
  recipient: {
    id: number
    name: string
    username: string
    avatarUrl?: string
    badge?: BadgeData
  } | null
  subject: string
  body: string
  snippet: string | null
  updatedAt: string
}

export function toDraftData(draft: MailDraft, topBadges?: Map<number, BadgeData>): DraftData {
  const recipient = isObj(draft.recipient) ? (draft.recipient as User) : null
  const text = (draft.body ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    id: draft.id,
    to: draft.to ?? '',
    recipient: recipient
      ? {
          id: recipient.id,
          name: recipient.name,
          username: recipient.username,
          avatarUrl: avatarUrl(recipient),
          badge: topBadges?.get(recipient.id),
        }
      : null,
    subject: draft.subject ?? '',
    body: draft.body ?? '',
    snippet: text ? (text.length > 80 ? `${text.slice(0, 80)}…` : text) : null,
    updatedAt: draft.updatedAt,
  }
}

export interface MailAttachmentData {
  id: number
  url: string
  filename: string
  mimeType: string | null
  filesize: number | null
}

const toMailAttachmentData = (attachment: MailAttachment): MailAttachmentData | null => {
  // Deliberately NOT wrapped in toCdnUrl: this is an access-controlled app
  // route (/api/mail-attachments/file/...) that checks the viewer's session.
  // A CDN fetch would arrive without cookies, fail auth, and could cache it.
  const url = attachment.url
  if (!url) return null
  return {
    id: attachment.id,
    url,
    filename: attachment.filename ?? 'file',
    mimeType: attachment.mimeType ?? null,
    filesize: attachment.filesize ?? null,
  }
}

const mailAttachments = (message: Message): MailAttachmentData[] =>
  (Array.isArray(message.attachments) ? message.attachments : [])
    .filter((a): a is MailAttachment => isObj(a))
    .map(toMailAttachmentData)
    .filter((a): a is MailAttachmentData => a !== null)

export interface MailMessageData {
  id: number
  body: string
  createdAt: string
  isMine: boolean
  senderName: string
  senderUsername: string
  senderContact?: string | null
  senderAvatarUrl?: string
  attachments: MailAttachmentData[]
}

export function toMailMessageData(message: Message, viewer: User): MailMessageData | null {
  const attachments = mailAttachments(message)
  const sender = message.sender
  if (isObj(sender)) {
    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      isMine: (sender as User).id === viewer.id,
      senderName: (sender as User).name,
      senderUsername: (sender as User).username,
      senderAvatarUrl: avatarUrl(sender as User),
      attachments,
    }
  }

  // Guest senders carry a display name + contact instead of a user row.
  const guestName = typeof message.senderName === 'string' ? message.senderName.trim() : ''
  if (!guestName) return null

  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    isMine: false,
    senderName: guestName,
    senderUsername: '',
    senderContact: message.senderContact ?? null,
    attachments,
  }
}

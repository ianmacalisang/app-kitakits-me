import type { ComponentType, SVGProps } from 'react'

import {
  CATEGORY_TINTS,
  type PostCategory,
  type PostCategoryIcon,
  postCategory,
} from '@/lib/categories'

import {
  BookIcon,
  CarIcon,
  EyeOffIcon,
  HeartIcon,
  LaughIcon,
  MegaphoneIcon,
  MusicIcon,
  QuestionIcon,
  ShareIcon,
  ShuffleIcon,
  TagIcon,
  UtensilsIcon,
} from './icons'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

export const CATEGORY_ICONS: Record<PostCategoryIcon, IconComponent> = {
  book: BookIcon,
  question: QuestionIcon,
  heart: HeartIcon,
  utensils: UtensilsIcon,
  car: CarIcon,
  music: MusicIcon,
  laugh: LaughIcon,
  megaphone: MegaphoneIcon,
  'eye-off': EyeOffIcon,
  shuffle: ShuffleIcon,
  tag: TagIcon,
}

export function CategoryChip({
  category,
  solid = false,
  className,
}: {
  category: PostCategory
  /** Solid colored pill — for overlays on dark media where tint text is unreadable. */
  solid?: boolean
  className?: string
}) {
  const c = postCategory(category)
  if (!c) return null
  const Icon = CATEGORY_ICONS[c.icon]
  const tint = CATEGORY_TINTS[c.tint]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight ${
        solid ? tint.chipActive : tint.chip
      } ${className ?? ''}`}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  )
}

// Neutral pill for share cards — a repost carries no category of its own;
// the embedded original's chip + tint mark it instead.
export function RepostBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-neutral-500/25 bg-neutral-500/10 px-2 py-0.5 text-[10px] font-semibold leading-tight text-neutral-600 dark:text-neutral-300 ${className ?? ''}`}
    >
      <ShareIcon className="h-3 w-3" />
      Reposted
    </span>
  )
}

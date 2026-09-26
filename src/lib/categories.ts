export const POST_CATEGORIES = [
  { value: 'kwento', label: 'Kwento', icon: 'book', tint: 'amber' },
  { value: 'tanong', label: 'Tanong', icon: 'question', tint: 'sky' },
  { value: 'feels', label: 'Feels', icon: 'heart', tint: 'rose' },
  { value: 'food', label: 'Food trip', icon: 'utensils', tint: 'orange' },
  { value: 'gala', label: 'Gala', icon: 'car', tint: 'emerald' },
  { value: 'music', label: 'Tugtugan', icon: 'music', tint: 'violet' },
  { value: 'memes', label: 'Memes', icon: 'laugh', tint: 'yellow' },
  { value: 'rant', label: 'Rant', icon: 'megaphone', tint: 'red' },
  { value: 'nsfw', label: 'NSFW', icon: 'eye-off', tint: 'fuchsia' },
  { value: 'random', label: 'Random', icon: 'shuffle', tint: 'indigo' },
] as const

export type PostCategory = (typeof POST_CATEGORIES)[number]['value']

export type PostCategoryIcon = (typeof POST_CATEGORIES)[number]['icon']

export type CategoryTint = (typeof POST_CATEGORIES)[number]['tint']

// Full class strings must stay literal so Tailwind picks them up.
export const CATEGORY_TINTS: Record<CategoryTint, { chip: string; chipActive: string; icon: string }> = {
  amber: {
    chip: 'border-amber-500/25 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
    chipActive: 'border-transparent bg-amber-600 text-white shadow-md shadow-amber-600/30',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  sky: {
    chip: 'border-sky-500/25 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300',
    chipActive: 'border-transparent bg-sky-600 text-white shadow-md shadow-sky-600/30',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  rose: {
    chip: 'border-rose-500/25 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300',
    chipActive: 'border-transparent bg-rose-600 text-white shadow-md shadow-rose-600/30',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  orange: {
    chip: 'border-orange-500/25 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-300',
    chipActive: 'border-transparent bg-orange-600 text-white shadow-md shadow-orange-600/30',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  emerald: {
    chip: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300',
    chipActive: 'border-transparent bg-emerald-600 text-white shadow-md shadow-emerald-600/30',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  violet: {
    chip: 'border-violet-500/25 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300',
    chipActive: 'border-transparent bg-violet-600 text-white shadow-md shadow-violet-600/30',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  yellow: {
    chip: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-300',
    chipActive: 'border-transparent bg-yellow-600 text-white shadow-md shadow-yellow-600/30',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
  red: {
    chip: 'border-red-500/25 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300',
    chipActive: 'border-transparent bg-red-600 text-white shadow-md shadow-red-600/30',
    icon: 'text-red-600 dark:text-red-400',
  },
  fuchsia: {
    chip: 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 hover:bg-fuchsia-500/20 dark:text-fuchsia-300',
    chipActive: 'border-transparent bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/30',
    icon: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
  indigo: {
    chip: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300',
    chipActive: 'border-transparent bg-indigo-600 text-white shadow-md shadow-indigo-600/30',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
}

export const isPostCategory = (value: unknown): value is PostCategory =>
  typeof value === 'string' && POST_CATEGORIES.some((c) => c.value === value)

export const postCategory = (value: string | null | undefined) =>
  POST_CATEGORIES.find((c) => c.value === value)

export const postCategoryLabel = (value: string | null | undefined) => postCategory(value)?.label

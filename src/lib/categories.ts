export const POST_CATEGORIES = [
  {
    value: 'kwento',
    label: 'Kwento',
    icon: 'book',
    tint: 'yellow',
    prompt: 'Share a kwento, {name}…',
  },
  {
    value: 'tanong',
    label: 'Tanong',
    icon: 'question',
    tint: 'sky',
    prompt: 'May tanong ka ba, {name}…',
  },
  {
    value: 'feels',
    label: 'Feels',
    icon: 'heart',
    tint: 'rose',
    prompt: 'Anong feels mo ngayon, {name}…',
  },
  {
    value: 'food',
    label: 'Food trip',
    icon: 'utensils',
    tint: 'orange',
    prompt: 'Saan tayo kakain, {name}…',
  },
  { value: 'gala', label: 'Gala', icon: 'car', tint: 'emerald', prompt: 'Saan ang gala, {name}…' },
  {
    value: 'music',
    label: 'Tugtugan',
    icon: 'music',
    tint: 'violet',
    prompt: 'Anong tumutugtog, {name}…',
  },
  {
    value: 'memes',
    label: 'Memes',
    icon: 'laugh',
    tint: 'lime',
    prompt: 'May meme ka ba, {name}…',
  },
  { value: 'rant', label: 'Rant', icon: 'megaphone', tint: 'red', prompt: 'Let it out, {name}…' },
  {
    value: 'promotion',
    label: 'Promotion',
    icon: 'tag',
    tint: 'pink',
    prompt: 'May ipo-promote ka ba, {name}…',
  },
  {
    value: 'nsfw',
    label: 'NSFW',
    icon: 'eye-off',
    tint: 'fuchsia',
    prompt: 'Spill, {name}… (18+)',
  },
  {
    value: 'random',
    label: 'Random',
    icon: 'shuffle',
    tint: 'slate',
    prompt: "What's on your mind, {name}…",
  },
] as const

export type PostCategory = (typeof POST_CATEGORIES)[number]['value']

export type PostCategoryIcon = (typeof POST_CATEGORIES)[number]['icon']

export type CategoryTint = (typeof POST_CATEGORIES)[number]['tint']

// Full class strings must stay literal so Tailwind picks them up.
export const CATEGORY_TINTS: Record<
  CategoryTint,
  { chip: string; chipActive: string; icon: string; card: string }
> = {
  lime: {
    chip: 'border-lime-500/25 bg-lime-500/10 text-lime-700 hover:bg-lime-500/20 dark:text-lime-300',
    chipActive: 'border-transparent bg-lime-600 text-white shadow-md shadow-lime-600/30',
    icon: 'text-lime-600 dark:text-lime-400',
    card: 'border-lime-500/40! bg-[linear-gradient(rgb(132_204_22/0.07),rgb(132_204_22/0.07))]',
  },
  sky: {
    chip: 'border-sky-500/25 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300',
    chipActive: 'border-transparent bg-sky-600 text-white shadow-md shadow-sky-600/30',
    icon: 'text-sky-600 dark:text-sky-400',
    card: 'border-sky-500/40! bg-[linear-gradient(rgb(14_165_233/0.07),rgb(14_165_233/0.07))]',
  },
  rose: {
    chip: 'border-rose-500/25 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300',
    chipActive: 'border-transparent bg-rose-600 text-white shadow-md shadow-rose-600/30',
    icon: 'text-rose-600 dark:text-rose-400',
    card: 'border-rose-500/40! bg-[linear-gradient(rgb(244_63_94/0.07),rgb(244_63_94/0.07))]',
  },
  orange: {
    chip: 'border-orange-500/25 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-300',
    chipActive: 'border-transparent bg-orange-600 text-white shadow-md shadow-orange-600/30',
    icon: 'text-orange-600 dark:text-orange-400',
    card: 'border-orange-500/40! bg-[linear-gradient(rgb(249_115_22/0.07),rgb(249_115_22/0.07))]',
  },
  emerald: {
    chip: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300',
    chipActive: 'border-transparent bg-emerald-600 text-white shadow-md shadow-emerald-600/30',
    icon: 'text-emerald-600 dark:text-emerald-400',
    card: 'border-emerald-500/40! bg-[linear-gradient(rgb(16_185_129/0.07),rgb(16_185_129/0.07))]',
  },
  violet: {
    chip: 'border-violet-500/25 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300',
    chipActive: 'border-transparent bg-violet-600 text-white shadow-md shadow-violet-600/30',
    icon: 'text-violet-600 dark:text-violet-400',
    card: 'border-violet-500/40! bg-[linear-gradient(rgb(139_92_246/0.07),rgb(139_92_246/0.07))]',
  },
  yellow: {
    chip: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-300',
    chipActive: 'border-transparent bg-yellow-600 text-white shadow-md shadow-yellow-600/30',
    icon: 'text-yellow-600 dark:text-yellow-400',
    card: 'border-yellow-500/40! bg-[linear-gradient(rgb(234_179_8/0.07),rgb(234_179_8/0.07))]',
  },
  red: {
    chip: 'border-red-500/25 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300',
    chipActive: 'border-transparent bg-red-600 text-white shadow-md shadow-red-600/30',
    icon: 'text-red-600 dark:text-red-400',
    card: 'border-red-500/40! bg-[linear-gradient(rgb(239_68_68/0.07),rgb(239_68_68/0.07))]',
  },
  fuchsia: {
    chip: 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 hover:bg-fuchsia-500/20 dark:text-fuchsia-300',
    chipActive: 'border-transparent bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/30',
    icon: 'text-fuchsia-600 dark:text-fuchsia-400',
    card: 'border-fuchsia-500/40! bg-[linear-gradient(rgb(217_70_239/0.07),rgb(217_70_239/0.07))]',
  },
  slate: {
    chip: 'border-slate-500/25 bg-slate-500/10 text-slate-700 hover:bg-slate-500/20 dark:text-slate-300',
    chipActive: 'border-transparent bg-slate-600 text-white shadow-md shadow-slate-600/30',
    icon: 'text-slate-600 dark:text-slate-400',
    card: 'border-slate-500/40! bg-[linear-gradient(rgb(100_116_139/0.07),rgb(100_116_139/0.07))]',
  },
  pink: {
    chip: 'border-pink-500/25 bg-pink-500/10 text-pink-700 hover:bg-pink-500/20 dark:text-pink-300',
    chipActive: 'border-transparent bg-pink-600 text-white shadow-md shadow-pink-600/30',
    icon: 'text-pink-600 dark:text-pink-400',
    card: 'border-pink-500/40! bg-[linear-gradient(rgb(236_72_153/0.07),rgb(236_72_153/0.07))]',
  },
}

export const isPostCategory = (value: unknown): value is PostCategory =>
  typeof value === 'string' && POST_CATEGORIES.some((c) => c.value === value)

export const postCategory = (value: string | null | undefined) =>
  POST_CATEGORIES.find((c) => c.value === value)

export const postCategoryLabel = (value: string | null | undefined) => postCategory(value)?.label

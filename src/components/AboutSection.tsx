'use client'

import { useRouter } from 'next/navigation'
import { Fragment, memo, useMemo, useState, useTransition, type ReactNode } from 'react'

import { updateAbout } from '@/actions/users'
import { ABOUT_TEMPLATES, type AboutBlockSeed } from '@/lib/aboutTemplates'
import { toCdnUrl } from '@/lib/cdn'
import { getEmbed } from '@/lib/embed'
import { compressImage } from '@/lib/image'
import type { AboutBlockData } from '@/lib/serialize'

import { BlurImage } from './BlurImage'
import { EmptyState } from './EmptyState'
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  EyeIcon,
  GripIcon,
  ImageIcon,
  LayoutIcon,
  LinkIcon,
  ListIcon,
  PlusIcon,
  TextIcon,
  UserIcon,
  XIcon,
} from './icons'
const inputClass = 'glass-input'

const MAX_ABOUT_BLOCKS = 25

type EditorImageBlock = Extract<AboutBlockData, { type: 'image' }> & {
  file?: File
  preview?: string
}
type EditorBlock = Exclude<AboutBlockData, { type: 'image' }> | EditorImageBlock

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Math.random().toString(36).slice(2)}`

const blankBlock = (type: EditorBlock['type']): EditorBlock => {
  switch (type) {
    case 'section':
      return { key: newKey(), type, heading: '', body: '' }
    case 'list':
      return { key: newKey(), type, heading: '', items: [{ title: '', description: '' }] }
    case 'links':
      return { key: newKey(), type, heading: '', items: [{ label: '', url: '' }] }
    case 'image':
      return { key: newKey(), type, mediaId: null, caption: '' }
    case 'embed':
      return { key: newKey(), type, url: '', caption: '' }
  }
}

const linkHref = (url: string) => (url.startsWith('http') ? url : `https://${url}`)

// Turns a template seed into an editable block with a fresh key.
const seedToBlock = (seed: AboutBlockSeed): EditorBlock => {
  const key = newKey()
  switch (seed.type) {
    case 'section':
      return { key, type: 'section', heading: seed.heading, body: seed.body }
    case 'list':
      return {
        key,
        type: 'list',
        heading: seed.heading,
        items: seed.items.map((i) =>
          typeof i === 'string'
            ? { title: i, description: '' }
            : { title: i.title, description: i.description ?? '' },
        ),
      }
    case 'links':
      return { key, type: 'links', heading: seed.heading, items: seed.items.map((i) => ({ ...i })) }
    case 'image':
      return { key, type: 'image', mediaId: null, caption: seed.caption }
    case 'embed':
      return { key, type: 'embed', url: seed.url, caption: seed.caption }
  }
}

const BLOCK_TYPES = [
  { type: 'section', label: 'Text', icon: TextIcon },
  { type: 'list', label: 'List', icon: ListIcon },
  { type: 'links', label: 'Links', icon: LinkIcon },
  { type: 'image', label: 'Photo', icon: ImageIcon },
  { type: 'embed', label: 'Embed', icon: CodeIcon },
] as const

const blockLabel = (type: EditorBlock['type']) =>
  BLOCK_TYPES.find((b) => b.type === type)?.label ?? type

// Short description shown on the collapsed block header.
function blockSummary(block: EditorBlock): string {
  switch (block.type) {
    case 'section':
      return block.heading || block.body.slice(0, 60) || 'Empty text'
    case 'list': {
      const items = block.items.filter((i) => i.title)
      return (
        block.heading ||
        (items.length
          ? items
              .slice(0, 2)
              .map((i) => i.title)
              .join(', ')
          : 'Empty list')
      )
    }
    case 'links': {
      const items = block.items.filter((i) => i.label)
      return block.heading || (items.length ? items.map((i) => i.label).join(', ') : 'No links')
    }
    case 'image':
      return block.caption || 'Photo'
    case 'embed':
      return block.caption || getEmbed(block.url)?.provider || block.url || 'No link yet'
  }
}

// Section header — inline icon, prominent editorial heading, gradient underrule.
const BlockHeader = ({
  icon: Icon,
  hero,
  children,
}: {
  icon: typeof TextIcon
  hero?: boolean
  children: ReactNode
}) => (
  <div className="flex flex-col gap-2.5">
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-700 ring-1 ring-inset ring-accent-500/15">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h3
        className={`font-bold tracking-tight text-neutral-800 ${
          hero ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
        }`}
      >
        {children}
      </h3>
    </div>
    <span
      aria-hidden
      className="block h-px bg-gradient-to-r from-accent-500/50 via-accent-300/15 to-transparent"
    />
  </div>
)

// Full-width link row — linktree-style card with a favicon-like letter chip.
const LinkRow = ({ label, url }: { label: string; url: string }) => {
  let host = ''
  try {
    host = new URL(linkHref(url)).hostname.replace(/^www\./, '')
  } catch {}
  return (
    <a
      href={linkHref(url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3.5 rounded-2xl border border-black/5 bg-white/60 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-300/60 hover:bg-white/80 hover:shadow-lg hover:shadow-accent-600/10 active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold uppercase text-accent-700 shadow-sm ring-1 ring-black/10">
        {host ? host[0] : <LinkIcon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-neutral-800">
          {label || host}
        </span>
        {host && label && <span className="block truncate text-xs text-neutral-400">{host}</span>}
      </span>
      <ArrowUpRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-600" />
    </a>
  )
}

// Hairline between sections — fades out at both edges with a subtle center dot.
const SectionDivider = () => (
  <div aria-hidden className="flex items-center gap-3">
    <span className="h-px flex-1 bg-gradient-to-r from-transparent via-accent-600/15 to-transparent" />
    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400/25" />
    <span className="h-px flex-1 bg-gradient-to-l from-transparent via-accent-600/15 to-transparent" />
  </div>
)

// One section inside the about card.
const AboutBlock = ({
  block,
  index: _index,
  hero,
}: {
  block: AboutBlockData
  index: number
  hero: boolean
}) => {
  switch (block.type) {
    case 'section':
      return (
        <section className="flex flex-col gap-5 py-8">
          {block.heading && (
            <BlockHeader icon={TextIcon} hero={hero}>
              {block.heading}
            </BlockHeader>
          )}
          {block.body && (
            <p className="max-w-prose whitespace-pre-wrap text-base leading-[1.85] text-neutral-600">
              {block.body}
            </p>
          )}
        </section>
      )
    case 'list': {
      // Items with descriptions → checklist rows; title-only → pill chips.
      const hasDescriptions = block.items.some((item) => item.description)
      return (
        <section className="flex flex-col gap-5 py-8">
          {block.heading && <BlockHeader icon={ListIcon}>{block.heading}</BlockHeader>}
          {hasDescriptions ? (
            <ul className="flex flex-col divide-y divide-black/5">
              {block.items.map((item, i) => (
                <li key={i} className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-accent-700"
                  >
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-800">
                      {item.title}
                    </span>
                    {item.description && (
                      <span className="mt-0.5 block text-sm leading-relaxed text-neutral-500">
                        {item.description}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {block.items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded-full border border-black/5 bg-white/50 px-3.5 py-1.5 text-sm font-medium text-neutral-700"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500/70"
                  />
                  {item.title}
                </li>
              ))}
            </ul>
          )}
        </section>
      )
    }
    case 'links':
      return (
        <section className="flex flex-col gap-5 py-8">
          {block.heading && <BlockHeader icon={LinkIcon}>{block.heading}</BlockHeader>}
          <div className="flex flex-col gap-2">
            {block.items.map((item, i) => (
              <LinkRow key={i} label={item.label} url={item.url} />
            ))}
          </div>
        </section>
      )
    case 'image':
      return (
        <figure className="group py-6">
          <div className="relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5">
            <BlurImage
              src={toCdnUrl(block.url) ?? block.url}
              alt={block.caption || 'About photo'}
              className="w-full bg-neutral-200/70 object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.02]"
            />
            {block.caption && (
              <figcaption className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-4 pb-3 pt-10 text-[13px] font-medium leading-snug text-white">
                {block.caption}
              </figcaption>
            )}
          </div>
        </figure>
      )
    case 'embed': {
      const embed = getEmbed(block.url)
      if (!embed) {
        // Unknown provider — fall back to a plain link card.
        return (
          <div className="py-6">
            <LinkRow label={block.caption} url={block.url} />
          </div>
        )
      }
      return (
        <figure className="flex flex-col gap-3.5 py-6">
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-accent-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-700 ring-1 ring-inset ring-accent-500/20">
            <CodeIcon className="h-3 w-3" />
            {embed.provider}
          </span>
          <iframe
            src={embed.embedUrl}
            title={block.caption || `${embed.provider} embed`}
            loading="lazy"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            referrerPolicy="no-referrer-when-downgrade"
            className={`w-full rounded-2xl border-0 bg-black/5 shadow-sm ring-1 ring-black/5 ${embed.frameClass}`}
          />
          {block.caption && (
            <figcaption className="text-center text-xs text-neutral-500">
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    }
    default:
      return null
  }
}

// Read-only rendering of the about page blocks — one card, divided sections.
const AboutBlocks = memo(function AboutBlocks({ blocks }: { blocks: AboutBlockData[] }) {
  return (
    <div className="glass relative overflow-hidden rounded-3xl">
      {/* Accent bar + soft ambient tint across the top of the card */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] bg-gradient-to-r from-accent-500 via-accent-400/70 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-accent-500/[0.06] to-transparent"
      />
      <div className="relative flex flex-col px-7 pb-6 sm:px-10">
        {blocks.map((block, index) => (
          <Fragment key={block.key}>
            {index > 0 && <SectionDivider />}
            <AboutBlock block={block} index={index} hero={index === 0} />
          </Fragment>
        ))}
      </div>
    </div>
  )
})

// Tiny wireframe of a template's block layout, shown inside picker cards.
const TemplatePreview = memo(function TemplatePreview({ blocks }: { blocks: AboutBlockSeed[] }) {
  const bar = 'rounded-full bg-neutral-300/80'
  const line = 'rounded-full bg-neutral-200'
  return (
    <div className="flex h-full min-h-[118px] flex-col justify-center gap-2.5 rounded-xl bg-white/80 p-3 ring-1 ring-black/5">
      {blocks.slice(0, 4).map((b, i) => {
        switch (b.type) {
          case 'section':
            return (
              <div key={i} className="flex flex-col gap-1">
                {b.heading ? <div className={`h-1.5 w-1/3 ${bar}`} /> : null}
                <div className={`h-1 w-full ${line}`} />
                <div className={`h-1 w-4/5 ${line}`} />
              </div>
            )
          case 'list':
            return (
              <div key={i} className="flex flex-col gap-1">
                {b.heading ? <div className={`h-1.5 w-1/3 ${bar}`} /> : null}
                {b.items.slice(0, 3).map((_, ii) => (
                  <div key={ii} className="flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-neutral-300" />
                    <div className={`h-1 ${ii % 2 ? 'w-1/3' : 'w-1/2'} ${line}`} />
                  </div>
                ))}
              </div>
            )
          case 'links':
            return (
              <div key={i} className="flex flex-wrap gap-1">
                {b.items.slice(0, 4).map((_, ii) => (
                  <div key={ii} className="h-2.5 w-10 rounded-full bg-accent-300/70" />
                ))}
              </div>
            )
          case 'image':
            return (
              <div
                key={i}
                className="flex h-9 items-center justify-center rounded-lg bg-neutral-200/80"
              >
                <ImageIcon className="h-3.5 w-3.5 text-neutral-400" />
              </div>
            )
          case 'embed':
            return (
              <div
                key={i}
                className="flex h-9 items-center justify-center rounded-lg bg-accent-100/80"
              >
                <CodeIcon className="h-3.5 w-3.5 text-accent-500" />
              </div>
            )
        }
      })}
      {blocks.length > 4 && (
        <div className="flex justify-center gap-1">
          {[0, 1, 2].map((d) => (
            <div key={d} className="h-1 w-1 rounded-full bg-neutral-300" />
          ))}
        </div>
      )}
    </div>
  )
})

// Decorative mini wireframe of an about page, shown on the empty state.
const EmptyAboutArt = memo(function EmptyAboutArt() {
  const line = 'rounded-full bg-neutral-200'
  return (
    <div
      aria-hidden
      className="pointer-events-none flex w-full max-w-[230px] flex-col gap-2.5 rounded-2xl bg-white/70 p-4 ring-1 ring-black/5"
    >
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 shrink-0 rounded-full bg-accent-200/80" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="h-1.5 w-2/3 rounded-full bg-neutral-300/80" />
          <div className={`h-1 w-1/2 ${line}`} />
        </div>
      </div>
      <div className={`h-1 w-full ${line}`} />
      <div className={`h-1 w-4/5 ${line}`} />
      <div className="flex gap-1.5">
        <div className="h-2.5 w-12 rounded-full bg-accent-300/70" />
        <div className="h-2.5 w-10 rounded-full bg-accent-300/70" />
        <div className="h-2.5 w-14 rounded-full bg-accent-300/70" />
      </div>
      <div className="flex h-10 items-center justify-center rounded-lg bg-neutral-200/70">
        <ImageIcon className="h-4 w-4 text-neutral-400" />
      </div>
    </div>
  )
})

const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-black/5 hover:text-neutral-700 disabled:opacity-30'

export function AboutEditor({
  initial,
  onDoneAction,
}: {
  initial: AboutBlockData[]
  onDoneAction: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<EditorBlock[]>(initial)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [pickerAt, setPickerAt] = useState<number | null>(null)
  const [showGallery, setShowGallery] = useState(initial.length === 0)
  const [previewMode, setPreviewMode] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const patch = (index: number, fn: (block: EditorBlock) => EditorBlock) =>
    setDraft((prev) => prev.map((b, i) => (i === index ? fn(b) : b)))

  const move = (index: number, dir: -1 | 1) =>
    setDraft((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })

  const moveTo = (from: number, to: number) =>
    setDraft((prev) => {
      if (from === to || from + 1 === to) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to > from ? to - 1 : to, 0, item)
      return next
    })

  const remove = (index: number) =>
    setDraft((prev) => {
      const block = prev[index]
      if (block?.type === 'image' && block.preview) URL.revokeObjectURL(block.preview)
      return prev.filter((_, i) => i !== index)
    })

  const add = (type: EditorBlock['type'], at?: number) =>
    setDraft((prev) => {
      if (prev.length >= MAX_ABOUT_BLOCKS) return prev
      const block = blankBlock(type)
      setFocusKey(block.key)
      const next = [...prev]
      next.splice(at ?? next.length, 0, block)
      return next
    })

  const applyTemplate = (blocks: AboutBlockSeed[]) => {
    setDraft(blocks.map(seedToBlock))
    setCollapsed({})
    setPickerAt(null)
    setShowGallery(false)
    setPreviewMode(false)
  }

  const pickImage = (index: number, file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    void compressImage(file).then((compressed) => {
      patch(index, (b) => {
        if (b.type !== 'image') return b
        if (b.preview) URL.revokeObjectURL(b.preview)
        return {
          ...b,
          file: compressed,
          preview: URL.createObjectURL(compressed),
          mediaId: null,
        }
      })
    })
  }

  const save = () => {
    setError(null)
    const formData = new FormData()
    const blocks = draft.map((b, i) => {
      switch (b.type) {
        case 'section':
          return { type: 'section', heading: b.heading, body: b.body }
        case 'list':
          return { type: 'list', heading: b.heading, items: b.items }
        case 'links':
          return { type: 'links', heading: b.heading, items: b.items }
        case 'image': {
          const out: Record<string, unknown> = {
            type: 'image',
            mediaId: b.mediaId,
            caption: b.caption,
          }
          if (b.file) {
            const field = `aboutImage${i}`
            formData.append(field, b.file)
            out.fileField = field
          }
          return out
        }
        case 'embed':
          return { type: 'embed', url: b.url, caption: b.caption }
      }
    })
    formData.append('about', JSON.stringify(blocks))
    startTransition(async () => {
      const result = await updateAbout(formData)
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
        onDoneAction()
      }
    })
  }

  // Draft mapped to display blocks for the live preview.
  const previewBlocks: AboutBlockData[] = useMemo(
    () =>
      draft.flatMap((b): AboutBlockData[] => {
        switch (b.type) {
          case 'section':
            return [{ key: b.key, type: 'section' as const, heading: b.heading, body: b.body }]
          case 'list':
            return [
              {
                key: b.key,
                type: 'list' as const,
                heading: b.heading,
                items: b.items.filter((i) => i.title),
              },
            ]
          case 'links':
            return [
              {
                key: b.key,
                type: 'links' as const,
                heading: b.heading,
                items: b.items.filter((i) => i.label && i.url),
              },
            ]
          case 'image':
            return b.preview || b.url
              ? [
                  {
                    key: b.key,
                    type: 'image' as const,
                    mediaId: b.mediaId,
                    url: b.preview ?? b.url,
                    caption: b.caption,
                  },
                ]
              : []
          case 'embed':
            return b.url
              ? [{ key: b.key, type: 'embed' as const, url: b.url, caption: b.caption }]
              : []
        }
      }),
    [draft],
  )

  const endDrag = () => {
    setDragIdx(null)
    setDropIdx(null)
  }

  // Divider between blocks — always visible dashed line with a + button that
  // expands into an inline block-type picker for that slot.
  const insertRow = (at: number) =>
    pickerAt === at ? (
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-400/50 bg-accent-50/50 px-3 py-3">
        {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              add(type, at)
              setPickerAt(null)
            }}
            className="flex items-center gap-1.5 rounded-full bg-accent-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-transform hover:scale-105 hover:bg-accent-600"
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Close"
          onClick={() => setPickerAt(null)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-black/5 hover:text-neutral-700"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setPickerAt(at)}
        aria-label="Insert block here"
        title="Insert block here"
        className="group/insert flex w-full items-center gap-2 py-0.5"
      >
        <span className="h-px flex-1 border-t border-dashed border-neutral-300 transition-colors group-hover/insert:border-accent-400" />
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-neutral-300 bg-white/70 text-neutral-400 transition-all group-hover/insert:border-accent-500 group-hover/insert:bg-accent-500 group-hover/insert:text-white">
          <PlusIcon className="h-3.5 w-3.5" />
        </span>
        <span className="h-px flex-1 border-t border-dashed border-neutral-300 transition-colors group-hover/insert:border-accent-400" />
      </button>
    )

  const dropIndicator = (at: number) =>
    dropIdx === at && dragIdx !== null && dragIdx !== at && dragIdx + 1 !== at ? (
      <div className="h-1 rounded-full bg-accent-400/80" />
    ) : null

  return (
    // Extra bottom padding keeps the last block clear of the fixed toolbar.
    <div className="flex flex-col gap-3 pb-10">
      {showGallery ? (
        <div className="glass flex flex-col gap-5 rounded-3xl p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="btn-accent-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
              <LayoutIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <h4 className="text-[15px] font-semibold">Choose a template</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                Pick a starting point — you can edit everything afterwards.
              </p>
              {draft.length > 0 && (
                <p className="mt-1 text-xs font-medium text-amber-600">
                  Choosing a template replaces your current blocks.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {ABOUT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.blocks)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-300/70 hover:shadow-lg hover:shadow-accent-600/10"
              >
                <div className={`bg-gradient-to-br p-3 ${t.tint}`}>
                  <TemplatePreview blocks={t.blocks} />
                </div>
                <div className="flex flex-col gap-0.5 px-4 pb-4 pt-2.5">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs leading-relaxed text-neutral-500">{t.description}</p>
                </div>
                <span className="absolute right-3 top-3 rounded-full bg-accent-500 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
                  Use template
                </span>
              </button>
            ))}

            {/* Blank canvas card */}
            <button
              type="button"
              onClick={() => setShowGallery(false)}
              className="group flex min-h-[180px] flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-neutral-300/70 bg-white/30 p-4 text-neutral-400 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-400/70 hover:bg-accent-50/40 hover:text-accent-600"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110">
                <PlusIcon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold">Start from blank</span>
              <span className="text-xs">Build it block by block</span>
            </button>
          </div>

          {draft.length > 0 && (
            <button
              type="button"
              onClick={() => setShowGallery(false)}
              className="self-center text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800"
            >
              Back to editing
            </button>
          )}
        </div>
      ) : previewMode ? (
        previewBlocks.length > 0 ? (
          <AboutBlocks blocks={previewBlocks} />
        ) : (
          <EmptyState
            plain
            compact
            icon={<EyeIcon />}
            title="Nothing to preview yet"
            message="Add a block to see it here."
          />
        )
      ) : (
        <>
          {draft.length === 0 ? (
            <div className="glass flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent-300/40 p-10 text-center">
              <p className="text-sm font-medium text-neutral-600">Start building your about page</p>
              <div className="flex flex-wrap justify-center gap-2">
                {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => add(type)}
                    className="btn-accent-soft flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium"
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {insertRow(0)}
              {draft.map((block, i) => (
                <div key={block.key} className="flex flex-col gap-2">
                  {dropIndicator(i)}
                  <div
                    onDragOver={(e) => {
                      if (dragIdx === null) return
                      e.preventDefault()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setDropIdx(e.clientY > rect.top + rect.height / 2 ? i + 1 : i)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragIdx !== null && dropIdx !== null) moveTo(dragIdx, dropIdx)
                      endDrag()
                    }}
                    className={`rounded-2xl border bg-white/50 transition ${
                      dragIdx === i ? 'border-accent-300/60 opacity-50' : 'border-black/5'
                    }`}
                  >
                    {/* Block header — drag handle, collapse toggle, controls */}
                    <div className="flex items-center gap-1 px-2.5 py-2">
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', String(i))
                          setDragIdx(i)
                        }}
                        onDragEnd={endDrag}
                        className="cursor-grab touch-none text-neutral-300 transition-colors hover:text-neutral-500 active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        <GripIcon className="h-4 w-4" />
                      </span>
                      <button
                        type="button"
                        onClick={() => setCollapsed((c) => ({ ...c, [block.key]: !c[block.key] }))}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="shrink-0 rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700">
                          {blockLabel(block.type)}
                        </span>
                        {collapsed[block.key] && (
                          <span className="truncate text-xs text-neutral-400">
                            {blockSummary(block)}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className={iconBtn}
                      >
                        <ChevronDownIcon className="h-4 w-4 rotate-180" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={i === draft.length - 1}
                        onClick={() => move(i, 1)}
                        className={iconBtn}
                      >
                        <ChevronDownIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove block"
                        onClick={() => remove(i)}
                        className={`${iconBtn} hover:text-red-500`}
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={collapsed[block.key] ? 'Expand' : 'Collapse'}
                        onClick={() => setCollapsed((c) => ({ ...c, [block.key]: !c[block.key] }))}
                        className={iconBtn}
                      >
                        <ChevronDownIcon
                          className={`h-4 w-4 transition-transform ${
                            collapsed[block.key] ? '' : 'rotate-180'
                          }`}
                        />
                      </button>
                    </div>

                    {!collapsed[block.key] && (
                      <div className="px-4 pb-4">
                        {block.type === 'section' && (
                          <div className="flex flex-col gap-2">
                            <input
                              value={block.heading}
                              maxLength={120}
                              autoFocus={block.key === focusKey}
                              placeholder="Heading (optional)"
                              onChange={(e) =>
                                patch(i, (b) =>
                                  b.type === 'section' ? { ...b, heading: e.target.value } : b,
                                )
                              }
                              className={inputClass}
                            />
                            <textarea
                              value={block.body}
                              rows={4}
                              maxLength={5000}
                              placeholder="Write something about yourself…"
                              onChange={(e) =>
                                patch(i, (b) =>
                                  b.type === 'section' ? { ...b, body: e.target.value } : b,
                                )
                              }
                              className={`${inputClass} resize-none`}
                            />
                          </div>
                        )}

                        {block.type === 'list' && (
                          <div className="flex flex-col gap-2">
                            <input
                              value={block.heading}
                              maxLength={120}
                              autoFocus={block.key === focusKey}
                              placeholder="Heading (optional)"
                              onChange={(e) =>
                                patch(i, (b) =>
                                  b.type === 'list' ? { ...b, heading: e.target.value } : b,
                                )
                              }
                              className={inputClass}
                            />
                            {block.items.map((item, ii) => (
                              <div key={ii} className="flex items-start gap-2">
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                  <input
                                    value={item.title}
                                    maxLength={200}
                                    placeholder={`Item ${ii + 1}`}
                                    onChange={(e) =>
                                      patch(i, (b) =>
                                        b.type === 'list'
                                          ? {
                                              ...b,
                                              items: b.items.map((v, vi) =>
                                                vi === ii ? { ...v, title: e.target.value } : v,
                                              ),
                                            }
                                          : b,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        patch(i, (b) =>
                                          b.type === 'list'
                                            ? {
                                                ...b,
                                                items: [
                                                  ...b.items.slice(0, ii + 1),
                                                  { title: '', description: '' },
                                                  ...b.items.slice(ii + 1),
                                                ],
                                              }
                                            : b,
                                        )
                                      }
                                    }}
                                    className={inputClass}
                                  />
                                  <input
                                    value={item.description}
                                    maxLength={300}
                                    placeholder="Description (optional)"
                                    onChange={(e) =>
                                      patch(i, (b) =>
                                        b.type === 'list'
                                          ? {
                                              ...b,
                                              items: b.items.map((v, vi) =>
                                                vi === ii
                                                  ? { ...v, description: e.target.value }
                                                  : v,
                                              ),
                                            }
                                          : b,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        patch(i, (b) =>
                                          b.type === 'list'
                                            ? {
                                                ...b,
                                                items: [
                                                  ...b.items.slice(0, ii + 1),
                                                  { title: '', description: '' },
                                                  ...b.items.slice(ii + 1),
                                                ],
                                              }
                                            : b,
                                        )
                                      }
                                    }}
                                    className={inputClass}
                                  />
                                </div>
                                <button
                                  type="button"
                                  aria-label="Remove item"
                                  onClick={() =>
                                    patch(i, (b) =>
                                      b.type === 'list'
                                        ? {
                                            ...b,
                                            items: b.items.filter((_, vi) => vi !== ii),
                                          }
                                        : b,
                                    )
                                  }
                                  className="mt-2 shrink-0 text-neutral-400 transition-colors hover:text-red-500"
                                >
                                  <XIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                patch(i, (b) =>
                                  b.type === 'list'
                                    ? {
                                        ...b,
                                        items: [...b.items, { title: '', description: '' }],
                                      }
                                    : b,
                                )
                              }
                              className="btn-accent-soft flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                            >
                              <PlusIcon className="h-3.5 w-3.5" /> Add item
                            </button>
                          </div>
                        )}

                        {block.type === 'links' && (
                          <div className="flex flex-col gap-2">
                            <input
                              value={block.heading}
                              maxLength={120}
                              autoFocus={block.key === focusKey}
                              placeholder="Heading (optional)"
                              onChange={(e) =>
                                patch(i, (b) =>
                                  b.type === 'links' ? { ...b, heading: e.target.value } : b,
                                )
                              }
                              className={inputClass}
                            />
                            {block.items.map((item, ii) => (
                              <div key={ii} className="flex items-center gap-2">
                                <input
                                  value={item.label}
                                  maxLength={80}
                                  placeholder="Label"
                                  onChange={(e) =>
                                    patch(i, (b) =>
                                      b.type === 'links'
                                        ? {
                                            ...b,
                                            items: b.items.map((v, vi) =>
                                              vi === ii ? { ...v, label: e.target.value } : v,
                                            ),
                                          }
                                        : b,
                                    )
                                  }
                                  className={`${inputClass} w-2/5`}
                                />
                                <input
                                  value={item.url}
                                  maxLength={500}
                                  placeholder="https://"
                                  onChange={(e) =>
                                    patch(i, (b) =>
                                      b.type === 'links'
                                        ? {
                                            ...b,
                                            items: b.items.map((v, vi) =>
                                              vi === ii ? { ...v, url: e.target.value } : v,
                                            ),
                                          }
                                        : b,
                                    )
                                  }
                                  className={inputClass}
                                />
                                <button
                                  type="button"
                                  aria-label="Remove link"
                                  onClick={() =>
                                    patch(i, (b) =>
                                      b.type === 'links'
                                        ? {
                                            ...b,
                                            items: b.items.filter((_, vi) => vi !== ii),
                                          }
                                        : b,
                                    )
                                  }
                                  className="shrink-0 text-neutral-400 transition-colors hover:text-red-500"
                                >
                                  <XIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                patch(i, (b) =>
                                  b.type === 'links'
                                    ? {
                                        ...b,
                                        items: [...b.items, { label: '', url: '' }],
                                      }
                                    : b,
                                )
                              }
                              className="btn-accent-soft flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                            >
                              <PlusIcon className="h-3.5 w-3.5" /> Add link
                            </button>
                          </div>
                        )}

                        {block.type === 'image' && (
                          <div className="flex flex-col gap-2">
                            {block.preview || block.url ? (
                              <div className="relative">
                                <BlurImage
                                  src={block.preview ?? toCdnUrl(block.url)}
                                  alt="About photo"
                                  className="max-h-64 w-full rounded-xl object-cover"
                                />
                              </div>
                            ) : null}
                            <label className="btn-accent-soft flex w-fit cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium">
                              <ImageIcon className="h-4 w-4" />
                              {block.preview || block.url ? 'Change photo' : 'Choose photo'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  pickImage(i, e.target.files?.[0])
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            <input
                              value={block.caption}
                              maxLength={300}
                              placeholder="Caption (optional)"
                              onChange={(e) =>
                                patch(i, (b) =>
                                  b.type === 'image' ? { ...b, caption: e.target.value } : b,
                                )
                              }
                              className={inputClass}
                            />
                          </div>
                        )}

                        {block.type === 'embed' && (
                          <div className="flex flex-col gap-2">
                            <input
                              value={block.url}
                              maxLength={500}
                              autoFocus={block.key === focusKey}
                              placeholder="Paste a YouTube, Spotify, TikTok, Vimeo, or Instagram link"
                              onChange={(e) =>
                                patch(i, (b) =>
                                  b.type === 'embed' ? { ...b, url: e.target.value } : b,
                                )
                              }
                              className={inputClass}
                            />
                            {block.url && (
                              <p className="text-xs text-neutral-400">
                                {getEmbed(block.url)
                                  ? `Will embed: ${getEmbed(block.url)!.provider}`
                                  : 'Will show as a link card'}
                              </p>
                            )}
                            <input
                              value={block.caption}
                              maxLength={300}
                              placeholder="Caption (optional)"
                              onChange={(e) =>
                                patch(i, (b) =>
                                  b.type === 'embed' ? { ...b, caption: e.target.value } : b,
                                )
                              }
                              className={inputClass}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {insertRow(i + 1)}
                </div>
              ))}
              {dropIndicator(draft.length)}
              <div
                onDragOver={(e) => {
                  if (dragIdx === null) return
                  e.preventDefault()
                  setDropIdx(draft.length)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIdx !== null) moveTo(dragIdx, draft.length)
                  endDrag()
                }}
                className="h-4"
              />

              {/* Prominent add-block card at the end of the page */}
              <div className="mt-1 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent-400/50 bg-accent-50/40 px-4 py-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-700/70">
                  Add a block
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => add(type)}
                      disabled={draft.length >= MAX_ABOUT_BLOCKS}
                      className="btn-accent-soft flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-40"
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="px-1 text-sm text-red-600">{error}</p>}

      {/* Toolbar — fixed above the floating bottom dock (bottom-22 = dock
          top + gap) so the top header can't overlap it; inset-x-4 +
          max-w-3xl keeps it inside the content column. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-22 z-30 mx-auto flex max-w-3xl justify-center">
        <div className="glass pointer-events-auto flex items-center gap-2 rounded-2xl px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              setShowGallery((v) => !v)
              setPreviewMode(false)
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              showGallery
                ? 'bg-accent-500 text-white'
                : 'bg-black/5 text-neutral-600 hover:bg-black/10'
            }`}
          >
            <LayoutIcon className="h-3.5 w-3.5" />
            Templates
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              previewMode
                ? 'bg-accent-500 text-white'
                : 'bg-black/5 text-neutral-600 hover:bg-black/10'
            }`}
          >
            <EyeIcon className="h-3.5 w-3.5" />
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={onDoneAction}
            disabled={pending}
            className="rounded-full px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn-primary rounded-full px-4 py-1.5 text-sm"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AboutSection({
  blocks,
  isSelf,
  username,
}: {
  blocks: AboutBlockData[]
  isSelf: boolean
  username: string
}) {
  const [editing, setEditing] = useState(false)

  if (editing && isSelf) {
    return <AboutEditor initial={blocks} onDoneAction={() => setEditing(false)} />
  }

  if (blocks.length === 0) {
    return (
      <div className="glass flex flex-col items-center gap-5 rounded-3xl px-6 py-10 text-center sm:px-10">
        {isSelf ? (
          <>
            <EmptyAboutArt />
            <div className="flex flex-col gap-1.5">
              <p className="text-[15px] font-semibold">Tell people about yourself</p>
              <p className="max-w-xs text-xs leading-relaxed text-neutral-500">
                Build an about page — start from a template or a blank canvas and mix:
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
                <span
                  key={type}
                  className="flex items-center gap-1 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-neutral-500"
                >
                  <Icon className="h-3 w-3" /> {label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-primary mt-1 flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm"
            >
              <PlusIcon className="h-4 w-4" /> Create about page
            </button>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-600/50 ring-1 ring-inset ring-accent-500/10">
              <UserIcon className="h-6 w-6" />
            </span>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-neutral-700">Nothing here yet</p>
              <p className="text-xs leading-relaxed text-neutral-500">
                @{username} hasn&apos;t added an about page yet.
              </p>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {isSelf && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-accent-soft rounded-full px-4 py-1.5 text-sm font-medium"
          >
            Edit about
          </button>
        </div>
      )}
      <AboutBlocks blocks={blocks} />
    </div>
  )
}

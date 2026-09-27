'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { compressImage } from '@/lib/image'
import {
  PROFILE_ACCENTS,
  PROFILE_CARD_STYLES,
  PROFILE_LAYOUTS,
  type ProfileAccent,
  type ProfileCardStyle,
  type ProfileLayout,
} from '@/lib/profileDesign'

import { BlurImage } from './BlurImage'
import { CheckIcon, ImageIcon, XIcon } from './icons'

const labelClass = 'mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-300'

// Tiny schematic previews for the layout picker — abstract shapes, not
// screenshots: banner strip, avatar dot, identity lines. The accent-* classes
// follow the selected palette automatically because the editor wraps itself
// in a data-profile-accent element.
function LayoutGlyph({ layout }: { layout: ProfileLayout }) {
  const box =
    'relative block h-16 w-full overflow-hidden rounded-xl border border-neutral-200/70 bg-white/80 dark:border-neutral-700 dark:bg-neutral-800'

  if (layout === 'hero') {
    return (
      <span className={`${box} bg-gradient-to-br from-accent-300/80 to-accent-500/60`}>
        <span className="absolute bottom-2 left-2 h-4 w-4 rounded-full bg-white ring-2 ring-white/50" />
        <span className="absolute bottom-3.5 left-8 h-1.5 w-12 rounded-full bg-white/80" />
        <span className="absolute bottom-1.5 left-8 h-1 w-8 rounded-full bg-white/50" />
      </span>
    )
  }

  if (layout === 'minimal') {
    return (
      <span
        className={`${box} flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-accent-300/50 to-accent-500/40`}
      >
        <span className="h-4 w-4 rounded-full bg-white ring-2 ring-white/50" />
        <span className="h-1.5 w-12 rounded-full bg-white/80" />
        <span className="h-1 w-8 rounded-full bg-white/50" />
      </span>
    )
  }

  return (
    <span className={box}>
      <span className="block h-6 w-full bg-gradient-to-br from-accent-300/80 to-accent-400/60" />
      <span className="absolute left-2 top-3.5 h-4 w-4 rounded-full bg-white ring-2 ring-neutral-100" />
      <span className="absolute left-8 top-4 h-1.5 w-12 rounded-full bg-neutral-300" />
      <span className="absolute left-8 top-6 h-1 w-8 rounded-full bg-neutral-200" />
    </span>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <span className={labelClass}>{children}</span>
}

// Shared layout/accent/background pickers — used by the design sheet and the
// onboarding step. Values travel through hidden inputs + the file input, so
// any parent <form> picks them up in FormData; layout/accent are also lifted
// via onLayoutChange/onAccentChange so parents can render a live preview.
export function ProfileDesignControls({
  layout,
  accent,
  cardStyle,
  backgroundUrl,
  onLayoutChange,
  onAccentChange,
  onCardStyleChange,
  onBackgroundChange,
}: {
  layout: ProfileLayout
  accent: ProfileAccent
  cardStyle: ProfileCardStyle
  backgroundUrl?: string
  onLayoutChange: (layout: ProfileLayout) => void
  onAccentChange: (accent: ProfileAccent) => void
  onCardStyleChange: (style: ProfileCardStyle) => void
  // Reports the object-URL preview (or null) so the parent preview can show
  // the pending image before it's uploaded.
  onBackgroundChange?: (previewUrl: string | null) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Revoke object-URL previews when replaced or unmounted.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const shown = preview ?? (removed ? null : (backgroundUrl ?? null))

  const pickFile = async (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    const compressed = await compressImage(file, { maxSize: 1920 })
    const input = inputRef.current
    if (input) {
      const dt = new DataTransfer()
      dt.items.add(compressed)
      input.files = dt.files
    }
    const url = URL.createObjectURL(compressed)
    setPreview(url)
    setRemoved(false)
    onBackgroundChange?.(url)
  }

  const clear = () => {
    const input = inputRef.current
    if (input) input.value = ''
    setPreview(null)
    setRemoved(true)
    onBackgroundChange?.(null)
  }

  return (
    <>
      <input type="hidden" name="profileLayout" value={layout} />
      <input type="hidden" name="profileAccent" value={accent} />
      <input type="hidden" name="profileCardStyle" value={cardStyle} />
      {removed && !preview && <input type="hidden" name="removeBackground" value="on" />}

      <div>
        <SectionLabel>Layout</SectionLabel>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Profile layout">
          {PROFILE_LAYOUTS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={layout === option.value}
              onClick={() => onLayoutChange(option.value)}
              className={`flex flex-col gap-1.5 rounded-2xl p-2 text-left ring-2 transition ${
                layout === option.value
                  ? 'bg-accent-500/10 ring-accent-500/60'
                  : 'ring-transparent hover:bg-black/[0.03] hover:ring-black/10 dark:hover:bg-white/5 dark:hover:ring-white/10'
              }`}
            >
              <LayoutGlyph layout={option.value} />
              <span className="px-0.5">
                <span className="block text-xs font-semibold">{option.label}</span>
                <span className="block text-[11px] leading-snug text-neutral-500">
                  {option.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Card style</SectionLabel>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Card style">
          {PROFILE_CARD_STYLES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={cardStyle === option.value}
              onClick={() => onCardStyleChange(option.value)}
              className={`flex items-center gap-3 rounded-2xl p-2.5 text-left ring-2 transition ${
                cardStyle === option.value
                  ? 'bg-accent-500/10 ring-accent-500/60'
                  : 'ring-transparent hover:bg-black/[0.03] hover:ring-black/10 dark:hover:bg-white/5 dark:hover:ring-white/10'
              }`}
            >
              {/* Mini surface swatch — frosted shows the backdrop bleeding
                  through; solid stays opaque */}
              <span
                className={`relative h-12 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-200/70 dark:border-neutral-700 ${
                  option.value === 'glass'
                    ? 'bg-gradient-to-br from-accent-300/70 via-accent-400/50 to-accent-500/40'
                    : 'bg-neutral-100 dark:bg-neutral-800'
                }`}
              >
                {option.value === 'glass' && (
                  <span className="absolute inset-1 rounded-md bg-white/60 backdrop-blur-[2px] ring-1 ring-white/70" />
                )}
                {option.value === 'solid' && (
                  <span className="absolute inset-1 rounded-md bg-white ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10" />
                )}
              </span>
              <span>
                <span className="block text-xs font-semibold">{option.label}</span>
                <span className="block text-[11px] leading-snug text-neutral-500">
                  {option.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Accent color</SectionLabel>
        <div className="flex flex-wrap gap-2.5">
          {PROFILE_ACCENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onAccentChange(option.value)}
              aria-label={`${option.label} accent`}
              aria-pressed={accent === option.value}
              title={option.label}
              className={`flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-neutral-900 ${
                accent === option.value
                  ? 'ring-neutral-800 dark:ring-white'
                  : 'ring-transparent hover:ring-neutral-300 dark:hover:ring-neutral-600'
              }`}
              style={{ background: option.swatch }}
            >
              {accent === option.value && <CheckIcon className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Background image</SectionLabel>
        <div
          role="button"
          tabIndex={0}
          aria-label="Change background image"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void pickFile(e.dataTransfer.files?.[0])
          }}
          className={`group relative aspect-[2/1] w-full cursor-pointer overflow-hidden rounded-2xl transition ${
            shown
              ? 'ring-2 ring-transparent hover:ring-black/15 dark:hover:ring-white/20'
              : 'border-2 border-dashed border-neutral-300/80 bg-black/[0.02] hover:border-accent-400 hover:bg-accent-500/5 dark:border-neutral-600 dark:bg-white/[0.03]'
          }`}
        >
          {shown ? (
            <>
              <BlurImage
                src={shown}
                alt="Background preview"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs font-semibold drop-shadow">Change background</span>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-400 transition group-hover:text-accent-600 dark:text-neutral-500 dark:group-hover:text-accent-400">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.05] transition group-hover:bg-accent-500/10 dark:bg-white/[0.06]">
                <ImageIcon className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold">Add a background image</span>
              <span className="px-4 text-center text-[11px] leading-snug">
                Click or drop — it fills the whole page behind your profile
              </span>
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          name="profileBackground"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-xs text-neutral-400">
            {shown
              ? 'Shown behind everything on your public page.'
              : 'Optional — a plain backdrop works too.'}
          </p>
          {shown && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-500 transition hover:text-red-600"
            >
              <XIcon className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
      </div>
    </>
  )
}

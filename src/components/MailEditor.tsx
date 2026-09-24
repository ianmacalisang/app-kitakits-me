'use client'

import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'

import {
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  OrderedListIcon,
  QuoteIcon,
  StrikethroughIcon,
  UnderlineIcon,
  XIcon,
} from './icons'

// Shared WYSIWYG editor for mail — emits sanitized-subset HTML via onChangeAction.
// Remount it (React `key`) to clear the contents after a successful send.
export function MailEditor({
  onChangeAction,
  initialContent = '',
  placeholder = 'Write your message…',
  autoFocus = false,
  minHeight = 150,
}: {
  onChangeAction: (html: string) => void
  initialContent?: string
  placeholder?: string
  autoFocus?: boolean
  minHeight?: number
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    // Required for SSR — the editor must only render on the client.
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class:
          'mail-richtext w-full bg-transparent px-3 py-3 text-[15px] leading-relaxed outline-none',
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => onChangeAction(editor.getHTML()),
  })

  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      empty: ctx.editor?.isEmpty ?? true,
      bold: ctx.editor?.isActive('bold') ?? false,
      italic: ctx.editor?.isActive('italic') ?? false,
      underline: ctx.editor?.isActive('underline') ?? false,
      strike: ctx.editor?.isActive('strike') ?? false,
      bulletList: ctx.editor?.isActive('bulletList') ?? false,
      orderedList: ctx.editor?.isActive('orderedList') ?? false,
      blockquote: ctx.editor?.isActive('blockquote') ?? false,
      link: ctx.editor?.isActive('link') ?? false,
    }),
  })

  const applyLink = () => {
    if (!editor) return
    const href = linkUrl.trim()
    if (!href) return
    const url = /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    setLinkUrl('')
    setLinkOpen(false)
  }

  const removeLink = () => {
    editor?.chain().focus().unsetLink().run()
    setLinkOpen(false)
  }

  const btn = (active?: boolean) =>
    `flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
      active
        ? 'bg-emerald-500/15 text-emerald-600'
        : 'text-neutral-500 hover:bg-black/5 hover:text-neutral-800'
    }`

  return (
    <div className="relative">
      {/* Formatting toolbar */}
      <div className="flex items-center gap-0.5 border-b border-black/5 px-2 py-1.5">
        <button
          type="button"
          aria-label="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={btn(state?.bold)}
        >
          <BoldIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={btn(state?.italic)}
        >
          <ItalicIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Underline"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          className={btn(state?.underline)}
        >
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Strikethrough"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          className={btn(state?.strike)}
        >
          <StrikethroughIcon className="h-4 w-4" />
        </button>

        <span className="mx-1.5 h-4 w-px bg-black/10" />

        <button
          type="button"
          aria-label="Bullet list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={btn(state?.bulletList)}
        >
          <ListIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Numbered list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={btn(state?.orderedList)}
        >
          <OrderedListIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Quote"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className={btn(state?.blockquote)}
        >
          <QuoteIcon className="h-4 w-4" />
        </button>

        <span className="mx-1.5 h-4 w-px bg-black/10" />

        <button
          type="button"
          aria-label="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (state?.link) {
              setLinkUrl(editor?.getAttributes('link').href ?? '')
            }
            setLinkOpen((v) => !v)
          }}
          className={btn(state?.link || linkOpen)}
        >
          <LinkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Inline link editor */}
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2">
          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              }
            }}
            placeholder="https://"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
          <button
            type="button"
            onClick={applyLink}
            className="text-xs font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
          >
            Apply
          </button>
          {state?.link && (
            <button
              type="button"
              onClick={removeLink}
              className="text-xs font-medium text-red-500 transition-colors hover:text-red-600"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            aria-label="Close link editor"
            onClick={() => setLinkOpen(false)}
            className="text-neutral-400 transition-colors hover:text-neutral-600"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Placeholder overlay — shown only while the doc is empty */}
      <div className="relative">
        {state?.empty && (
          <span className="pointer-events-none absolute left-3 top-3 z-10 text-[15px] text-neutral-400">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

'use client'

import { ChevronDown, ChevronUp, Plus, Trash2, Type, Link2, Image as ImageIcon, List as ListIcon } from 'lucide-react'
import type { Block } from '@/lib/profile-blocks'

const inputCls = 'h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary'
const TYPES = [
  { type: 'text', label: 'Text', Icon: Type },
  { type: 'links', label: 'Links', Icon: Link2 },
  { type: 'image', label: 'Image', Icon: ImageIcon },
  { type: 'list', label: 'List', Icon: ListIcon },
] as const

const MAX_BLOCKS = 20

function emptyBlock(type: Block['type']): Block {
  const id = crypto.randomUUID()
  switch (type) {
    case 'text': return { id, type, heading: '', body: '' }
    case 'links': return { id, type, title: '', items: [{ label: '', url: '' }] }
    case 'image': return { id, type, url: '', alt: '', caption: '' }
    case 'list': return { id, type, title: '', items: [''] }
  }
}

/**
 * The slim-Linktree block builder: an ordered list of typed content blocks (text / links / image / list) the
 * contractor arranges on their public page. Reorder via up/down (drag is a later polish); each type has its own
 * inline editor. The whole array saves atomically with the rest of the profile.
 */
export function ProfileBlocksEditor({ value, onChange }: { value: Block[]; onChange: (b: Block[]) => void }) {
  const update = (i: number, b: Block) => onChange(value.map((x, j) => (j === i ? b : x)))
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = value.slice()
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
    onChange(next)
  }
  const add = (type: Block['type']) => onChange([...value, emptyBlock(type)])

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-muted-foreground">No blocks yet — add one below to build out your page.</p>}
      {value.map((b, i) => (
        <div key={b.id} className="rounded-lg border border-border bg-card/50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{b.type}</span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"><ChevronUp className="size-4" /></button>
              <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"><ChevronDown className="size-4" /></button>
              <button type="button" aria-label="Delete block" onClick={() => remove(i)} className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>
            </div>
          </div>
          <BlockBody block={b} onChange={(nb) => update(i, nb)} />
        </div>
      ))}
      {value.length < MAX_BLOCKS && (
        <div className="flex flex-wrap gap-2 pt-1">
          {TYPES.map(({ type, label, Icon }) => (
            <button key={type} type="button" onClick={() => add(type)} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-primary">
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BlockBody({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  if (block.type === 'text') {
    return (
      <div className="space-y-2">
        <input value={block.heading ?? ''} onChange={(e) => onChange({ ...block, heading: e.target.value })} placeholder="Heading (optional)" className={inputCls} />
        <textarea value={block.body} onChange={(e) => onChange({ ...block, body: e.target.value })} rows={3} placeholder="Write something…" className={`${inputCls} h-auto resize-y py-2`} />
      </div>
    )
  }
  if (block.type === 'links') {
    const setItem = (k: number, key: 'label' | 'url', v: string) => onChange({ ...block, items: block.items.map((x, j) => (j === k ? { ...x, [key]: v } : x)) })
    return (
      <div className="space-y-2">
        <input value={block.title ?? ''} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Section title (optional)" className={inputCls} />
        {block.items.map((it, k) => (
          <div key={k} className="flex gap-2">
            <input value={it.label} onChange={(e) => setItem(k, 'label', e.target.value)} placeholder="Label" className={`${inputCls} w-40`} />
            <input value={it.url} onChange={(e) => setItem(k, 'url', e.target.value)} placeholder="https://…" className={`${inputCls} flex-1`} />
            <button type="button" aria-label="Remove link" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== k) })} className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
          </div>
        ))}
        {block.items.length < 15 && <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { label: '', url: '' }] })} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Plus className="size-4" /> Add link</button>}
      </div>
    )
  }
  if (block.type === 'image') {
    return (
      <div className="space-y-2">
        <input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="Image URL (https://…)" className={inputCls} />
        <div className="flex gap-2">
          <input value={block.alt ?? ''} onChange={(e) => onChange({ ...block, alt: e.target.value })} placeholder="Alt text" className={`${inputCls} flex-1`} />
          <input value={block.caption ?? ''} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Caption (optional)" className={`${inputCls} flex-1`} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {block.url.trim() && <img src={block.url} alt="" className="max-h-40 w-full rounded-md border border-border object-cover" />}
      </div>
    )
  }
  // list
  const setItem = (k: number, v: string) => onChange({ ...block, items: block.items.map((x, j) => (j === k ? v : x)) })
  return (
    <div className="space-y-2">
      <input value={block.title ?? ''} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="List title (optional)" className={inputCls} />
      {block.items.map((it, k) => (
        <div key={k} className="flex gap-2">
          <input value={it} onChange={(e) => setItem(k, e.target.value)} placeholder="List item" className={`${inputCls} flex-1`} />
          <button type="button" aria-label="Remove item" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== k) })} className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
        </div>
      ))}
      {block.items.length < 20 && <button type="button" onClick={() => onChange({ ...block, items: [...block.items, ''] })} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Plus className="size-4" /> Add item</button>}
    </div>
  )
}

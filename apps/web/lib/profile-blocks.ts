/** Landing-page content blocks (the slim-Linktree builder). Shared by the editor, the save action, and the
 *  public page. Mirrors the API's discriminated-union zod schema (apps/api/.../profile/router.ts). */
export type Block =
  | { id: string; type: 'text'; heading?: string | null; body: string }
  | { id: string; type: 'links'; title?: string | null; items: { label: string; url: string }[] }
  | { id: string; type: 'image'; url: string; alt?: string | null; caption?: string | null }
  | { id: string; type: 'list'; title?: string | null; items: string[] }

/** Drop incomplete blocks + trim, so a half-filled block doesn't trip the API's min-length validation. */
export function cleanBlocks(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    if (b.type === 'text') {
      if (b.body.trim()) out.push({ ...b, heading: b.heading?.trim() || null, body: b.body.trim() })
    } else if (b.type === 'links') {
      const items = b.items.filter((i) => i.label.trim() && i.url.trim()).map((i) => ({ label: i.label.trim(), url: i.url.trim() }))
      if (items.length) out.push({ ...b, title: b.title?.trim() || null, items })
    } else if (b.type === 'image') {
      if (b.url.trim()) out.push({ ...b, url: b.url.trim(), alt: b.alt?.trim() || null, caption: b.caption?.trim() || null })
    } else if (b.type === 'list') {
      const items = b.items.map((s) => s.trim()).filter(Boolean)
      if (items.length) out.push({ ...b, title: b.title?.trim() || null, items })
    }
  }
  return out
}

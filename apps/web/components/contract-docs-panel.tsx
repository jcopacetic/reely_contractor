'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileSignature, Plus, Pencil, Trash2, Check, ChevronRight, PenLine } from 'lucide-react'
import { addContractDocAction, editContractDocAction, removeContractDocAction, signContractDocAction } from '@/app/contractor/actions'
import { DOC_TEMPLATES, DOC_KIND_LABEL, type DocKind } from '@/lib/doc-templates'

export type ContractDoc = {
  id: string
  kind: DocKind
  title: string
  body: string
  addedByRole: 'client' | 'contractor'
  myRole: 'client' | 'contractor'
  clientSigned: boolean
  clientSignerName: string | null
  clientSignedAt: string | null
  contractorSigned: boolean
  contractorSignerName: string | null
  contractorSignedAt: string | null
  executed: boolean
  locked: boolean
  createdAt: string
}

const fmt = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
type Draft = { editingId: string | null; kind: DocKind; title: string; body: string }

/**
 * Optional agreement documents on a contract (NDA, IP assignment, confidentiality, …). A party adds one from a
 * template (or custom) and edits it while unsigned; both parties e-sign with a typed name. Once anyone signs the
 * body locks; both signed = executed. Refreshes to canonical server state after each action.
 */
export function ContractDocsPanel({ contractId, initial }: { contractId: string; initial: ContractDoc[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function pickKind(kind: DocKind) {
    const t = DOC_TEMPLATES[kind]
    setDraft((d) => ({ editingId: d?.editingId ?? null, kind, title: t.title, body: t.body }))
  }
  function submit() {
    if (!draft) return
    setErr(null)
    if (!draft.title.trim() || !draft.body.trim()) { setErr('Add a title and body.'); return }
    const input = { kind: draft.kind, title: draft.title.trim(), body: draft.body }
    start(async () => {
      const r = draft.editingId ? await editContractDocAction(draft.editingId, input) : await addContractDocAction(contractId, input)
      if ('error' in r && r.error) { setErr(r.error); return }
      setDraft(null); router.refresh()
    })
  }
  function act(fn: () => Promise<{ ok?: true; error?: string }>) {
    setErr(null)
    start(async () => {
      const r = await fn()
      if ('error' in r && r.error) setErr(r.error)
      else router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><FileSignature className="size-4 text-muted-foreground" /> Agreement documents</h2>
        {!draft && <button type="button" onClick={() => { setErr(null); pickKind('nda') }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="size-3.5" /> Add</button>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Attach optional agreements — an NDA, IP assignment, and more — and both sign. Templates are a starting point to edit; not legal advice.</p>

      {draft && (
        <div className="mb-5 space-y-3 rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-medium">{draft.editingId ? 'Edit document' : 'Add a document'}</p>
          {!draft.editingId && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(DOC_TEMPLATES) as DocKind[]).map((k) => (
                <button key={k} type="button" onClick={() => pickKind(k)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${draft.kind === k ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted'}`}>{DOC_KIND_LABEL[k]}</button>
              ))}
            </div>
          )}
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Document title…" className="h-9 w-full rounded-md border border-border bg-card px-2.5 text-sm outline-none focus:border-primary" />
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={10} placeholder="Document text…" className="w-full rounded-md border border-border bg-card px-2.5 py-2 font-mono text-xs leading-relaxed outline-none focus:border-primary" />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={submit} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : null} {draft.editingId ? 'Save' : 'Attach'}</button>
            <button type="button" onClick={() => setDraft(null)} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {initial.length === 0 && !draft ? (
        <p className="text-sm text-muted-foreground">No documents attached.</p>
      ) : (
        <ul className="space-y-3">
          {initial.map((d) => (
            <DocCard key={d.id} d={d} pending={pending} onEdit={() => { setErr(null); setDraft({ editingId: d.id, kind: d.kind, title: d.title, body: d.body }) }} onRemove={() => act(() => removeContractDocAction(d.id))} onSign={(name) => act(() => signContractDocAction(d.id, name))} />
          ))}
        </ul>
      )}
      {err && !draft && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </section>
  )
}

function DocCard({ d, pending, onEdit, onRemove, onSign }: { d: ContractDoc; pending: boolean; onEdit: () => void; onRemove: () => void; onSign: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [signing, setSigning] = useState(false)
  const [name, setName] = useState('')
  const iSigned = d.myRole === 'client' ? d.clientSigned : d.contractorSigned
  const isAdder = d.myRole === d.addedByRole

  const sig = (label: string, signed: boolean, who: string | null, at: string | null) => (
    <span className={signed ? 'text-emerald-700' : 'text-muted-foreground'}>{label}: {signed ? `${who ?? 'signed'} · ${at ? fmt(at) : ''}` : 'not signed'}</span>
  )

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{DOC_KIND_LABEL[d.kind]}</span>
          {d.executed ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Fully executed</span> : d.locked ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700">Awaiting signatures</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Draft</span>}
        </span>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 text-left text-sm font-medium"><ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} /> {d.title}</button>
      {open && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-sans text-xs leading-relaxed text-foreground">{d.body}</pre>}

      <div className="mt-2 flex flex-col gap-0.5 text-xs">
        {sig('Client', d.clientSigned, d.clientSignerName, d.clientSignedAt)}
        {sig('Contractor', d.contractorSigned, d.contractorSignerName, d.contractorSignedAt)}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!iSigned && (signing ? (
          <div className="flex items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your full name to sign" className="h-8 w-56 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary" />
            <button type="button" onClick={() => { if (name.trim()) { onSign(name.trim()); setSigning(false); setName('') } }} disabled={pending || !name.trim()} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"><Check className="size-3.5" /> Sign</button>
            <button type="button" onClick={() => setSigning(false)} className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm hover:bg-muted">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setSigning(true)} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"><PenLine className="size-3.5" /> Sign</button>
        ))}
        {iSigned && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="size-3.5" /> You signed</span>}
        {isAdder && !d.locked && <button type="button" onClick={onEdit} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Pencil className="size-3.5" /> Edit</button>}
        {isAdder && !d.executed && <button type="button" onClick={onRemove} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"><Trash2 className="size-3.5" /> Remove</button>}
      </div>
    </li>
  )
}

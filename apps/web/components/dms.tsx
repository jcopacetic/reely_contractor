'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { Loader2, Send, MessagesSquare } from 'lucide-react'
import { loadMessagesAction, sendDmAction } from '@/app/contractor/actions'

type Participant = { userId: string; displayName: string; avatarUrl: string | null }
type DmMessage = { id: string; body: string; fromMe: boolean; senderUserId: string; createdAt: string }
type Thread = {
  threadId: string
  other: Participant
  lastMessage: { body: string; fromMe: boolean; createdAt: string } | null
  unread: number
  lastActivityAt: string
}
type ActiveConvo = { threadId: string; other: Participant; messages: DmMessage[] }
type Me = { displayName: string; avatarUrl: string | null }

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d` : new Date(iso).toLocaleDateString()
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
}

function Avatar({ name, url, className = 'size-9' }: { name: string; url: string | null; className?: string }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  return <span className={`${className} grid shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary`}>{initials(name)}</span>
}

/** The DM inbox: a thread list + the active conversation. Reads via server actions; polls the open thread
 *  every 4s for new messages (Realtime is a later enhancement). Sends are optimistic. */
export function DmInbox({ initialThreads, initialActive, me }: { initialThreads: Thread[]; initialActive: ActiveConvo | null; me: Me }) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads)
  const [active, setActive] = useState<ActiveConvo | null>(initialActive)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, start] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  // mark the initially-opened thread read in the local list
  useEffect(() => {
    if (initialActive) setThreads((ts) => ts.map((t) => (t.threadId === initialActive.threadId ? { ...t, unread: 0 } : t)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [active?.messages.length, active?.threadId])

  // poll the open thread
  useEffect(() => {
    if (!active) return
    const threadId = active.threadId
    const id = setInterval(async () => {
      const r = await loadMessagesAction(threadId)
      if (!('error' in r)) setActive((a) => (a && a.threadId === threadId ? { ...a, messages: r.messages, other: r.other } : a))
    }, 4000)
    return () => clearInterval(id)
  }, [active?.threadId])

  async function select(threadId: string) {
    if (active?.threadId === threadId) return
    setLoading(true)
    const r = await loadMessagesAction(threadId)
    setLoading(false)
    if ('error' in r) return
    setActive({ threadId, other: r.other, messages: r.messages })
    setThreads((ts) => ts.map((t) => (t.threadId === threadId ? { ...t, unread: 0 } : t)))
    window.history.replaceState(null, '', `/contractor/dms?t=${threadId}`)
  }

  function send() {
    const body = draft.trim()
    if (!body || !active) return
    const threadId = active.threadId
    setDraft('')
    const temp: DmMessage = { id: `tmp-${threadId}-${body.length}`, body, fromMe: true, senderUserId: '', createdAt: new Date().toISOString() }
    setActive((a) => (a && a.threadId === threadId ? { ...a, messages: [...a.messages, temp] } : a))
    setThreads((ts) => {
      const t = ts.find((x) => x.threadId === threadId)
      if (!t) return ts
      return [{ ...t, lastMessage: { body, fromMe: true, createdAt: new Date().toISOString() }, lastActivityAt: new Date().toISOString() }, ...ts.filter((x) => x.threadId !== threadId)]
    })
    start(async () => {
      await sendDmAction(threadId, body)
      const m = await loadMessagesAction(threadId)
      if (!('error' in m)) setActive((a) => (a && a.threadId === threadId ? { ...a, messages: m.messages } : a))
    })
  }

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-[18rem_1fr]">
      {/* Thread list */}
      <aside className={`flex flex-col border-border sm:border-r ${active ? 'hidden sm:flex' : 'flex'}`}>
        <div className="border-b border-border px-4 py-3 font-display text-sm font-semibold">Messages</div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No conversations yet. Open a member's profile and hit Message to start one.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.threadId}
                onClick={() => select(t.threadId)}
                className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition hover:bg-muted/50 ${active?.threadId === t.threadId ? 'bg-muted/60' : ''}`}
              >
                <Avatar name={t.other.displayName} url={t.other.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{t.other.displayName}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(t.lastActivityAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{t.lastMessage ? `${t.lastMessage.fromMe ? 'You: ' : ''}${t.lastMessage.body}` : 'No messages yet'}</span>
                    {t.unread > 0 && <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{t.unread}</span>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Conversation */}
      <section className={`flex flex-col ${active ? 'flex' : 'hidden sm:flex'}`}>
        {!active ? (
          <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
            <div>
              <MessagesSquare className="mx-auto mb-2 size-8 opacity-40" />
              Pick a conversation.
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button onClick={() => { setActive(null); window.history.replaceState(null, '', '/contractor/dms') }} className="text-sm text-muted-foreground sm:hidden">←</button>
              <Avatar name={active.other.displayName} url={active.other.avatarUrl} className="size-8" />
              <a href={`/contractor/u/${active.other.userId}`} className="font-display text-sm font-semibold hover:text-primary">{active.other.displayName}</a>
            </header>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {active.messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Say hello 👋</p>}
              {active.messages.map((m) => (
                <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.fromMe ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-0.5 text-[10px] ${m.fromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{timeAgo(m.createdAt)}</p>
                  </div>
                </div>
              ))}
              {loading && <p className="text-center text-xs text-muted-foreground">Loading…</p>}
            </div>
            <div className="flex items-end gap-2 border-t border-border p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                rows={1}
                placeholder="Write a message…"
                className="max-h-32 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button onClick={send} disabled={pending || !draft.trim()} className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

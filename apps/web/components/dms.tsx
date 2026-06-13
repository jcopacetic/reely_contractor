'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { Loader2, Send, MessagesSquare, Briefcase } from 'lucide-react'
import { loadMessagesAction, sendDmAction } from '@/app/contractor/actions'

type Kind = 'direct' | 'hire' | 'team'
type RoomMsg = { id: string; body: string; fromMe: boolean; senderUserId: string; senderLabel: string; fromTenant: boolean; createdAt: string }
type Room = {
  roomId: string
  kind: Kind
  title: string
  avatarUrl: string | null
  lastMessage: { body: string; createdAt: string } | null
  unread: number
  lastActivityAt: string
}
type ActiveConvo = { roomId: string; kind: Kind; title: string; avatarUrl: string | null; messages: RoomMsg[] }
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

function Avatar({ name, url, work, className = 'size-9' }: { name: string; url: string | null; work?: boolean; className?: string }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  if (work) return <span className={`${className} grid shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-700`}><Briefcase className="size-4" /></span>
  return <span className={`${className} grid shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary`}>{initials(name)}</span>
}

/** The chat inbox: a room list + the active conversation. `direct` rooms are peer DMs; `hire`/`team` rooms are
 *  org-labeled work chats with a client. Reads via server actions; polls the open room every 4s (Realtime is a
 *  later enhancement). Sends are optimistic. Opening a room marks it read (the store advances the read cursor). */
export function DmInbox({ initialRooms, initialActive, me }: { initialRooms: Room[]; initialActive: ActiveConvo | null; me: Me }) {
  void me
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const [active, setActive] = useState<ActiveConvo | null>(initialActive)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, start] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialActive) setRooms((rs) => rs.map((r) => (r.roomId === initialActive.roomId ? { ...r, unread: 0 } : r)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [active?.messages.length, active?.roomId])

  useEffect(() => {
    if (!active) return
    const roomId = active.roomId
    const id = setInterval(async () => {
      const r = await loadMessagesAction(roomId)
      if (!('error' in r)) setActive((a) => (a && a.roomId === roomId ? { ...a, messages: r.messages, title: r.title } : a))
    }, 4000)
    return () => clearInterval(id)
  }, [active?.roomId])

  async function select(room: Room) {
    if (active?.roomId === room.roomId) return
    setLoading(true)
    const r = await loadMessagesAction(room.roomId)
    setLoading(false)
    if ('error' in r) return
    setActive({ roomId: room.roomId, kind: r.kind, title: r.title, avatarUrl: room.avatarUrl, messages: r.messages })
    setRooms((rs) => rs.map((x) => (x.roomId === room.roomId ? { ...x, unread: 0 } : x)))
    window.history.replaceState(null, '', `/contractor/dms?r=${room.roomId}`)
  }

  function send() {
    const body = draft.trim()
    if (!body || !active) return
    const roomId = active.roomId
    setDraft('')
    const temp: RoomMsg = { id: `tmp-${roomId}-${body.length}`, body, fromMe: true, senderUserId: '', senderLabel: '', fromTenant: false, createdAt: new Date().toISOString() }
    setActive((a) => (a && a.roomId === roomId ? { ...a, messages: [...a.messages, temp] } : a))
    setRooms((rs) => {
      const r = rs.find((x) => x.roomId === roomId)
      if (!r) return rs
      return [{ ...r, lastMessage: { body, createdAt: new Date().toISOString() }, lastActivityAt: new Date().toISOString() }, ...rs.filter((x) => x.roomId !== roomId)]
    })
    start(async () => {
      await sendDmAction(roomId, body)
      const m = await loadMessagesAction(roomId)
      if (!('error' in m)) setActive((a) => (a && a.roomId === roomId ? { ...a, messages: m.messages } : a))
    })
  }

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-[18rem_1fr]">
      {/* Room list */}
      <aside className={`flex flex-col border-border sm:border-r ${active ? 'hidden sm:flex' : 'flex'}`}>
        <div className="border-b border-border px-4 py-3 font-display text-sm font-semibold">Messages</div>
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No conversations yet. Open a member's profile and hit Message to start one.</p>
          ) : (
            rooms.map((r) => (
              <button
                key={r.roomId}
                onClick={() => select(r)}
                className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition hover:bg-muted/50 ${active?.roomId === r.roomId ? 'bg-muted/60' : ''}`}
              >
                <Avatar name={r.title} url={r.avatarUrl} work={r.kind !== 'direct'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{r.title}</span>
                      {r.kind !== 'direct' && <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-700">{r.kind === 'team' ? 'Team' : 'Work'}</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(r.lastActivityAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{r.lastMessage ? r.lastMessage.body : 'No messages yet'}</span>
                    {r.unread > 0 && <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{r.unread}</span>}
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
              <Avatar name={active.title} url={active.avatarUrl} work={active.kind !== 'direct'} className="size-8" />
              <span className="font-display text-sm font-semibold">{active.title}</span>
              {active.kind !== 'direct' && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-700">{active.kind === 'team' ? 'Team' : 'Work'}</span>}
            </header>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {active.messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Say hello 👋</p>}
              {active.messages.map((m) => (
                <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.fromMe ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted'}`}>
                    {!m.fromMe && active.kind !== 'direct' && <p className="mb-0.5 text-[11px] font-medium text-foreground/70">{m.senderLabel}{m.fromTenant && active.title !== m.senderLabel ? ` · ${active.title}` : ''}</p>}
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

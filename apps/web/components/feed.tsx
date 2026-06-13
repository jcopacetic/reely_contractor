'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, MessageSquare, CornerDownRight } from 'lucide-react'
import { createPostAction, reactAction, loadCommentsAction, addCommentAction } from '@/app/contractor/actions'

type Author = { userId: string; displayName: string; avatarUrl: string | null; publicSlug: string | null }
type Me = { displayName: string; avatarUrl: string | null }
type CommentView = { id: string; parentId: string | null; author: Author; body: string; createdAt: string }
export type FeedPost = {
  id: string
  author: Author
  body: string
  kind: string
  linkUrl: string | null
  linkLabel: string | null
  createdAt: string
  reactionCount: number
  commentCount: number
  myReaction: string | null
}

const REACTIONS: { type: string; emoji: string; label: string }[] = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'celebrate', emoji: '🎉', label: 'Celebrate' },
  { type: 'insightful', emoji: '💡', label: 'Insightful' },
  { type: 'fire', emoji: '🔥', label: 'Fire' },
  { type: 'support', emoji: '🤝', label: 'Support' },
]

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

export function Feed({ initial, me, composer = true, emptyText }: { initial: FeedPost[]; me: Me; composer?: boolean; emptyText?: string }) {
  return (
    <div className="space-y-5">
      {composer && <Composer me={me} />}
      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          {emptyText ?? 'Quiet in here. Be the first to post something to the club.'}
        </div>
      ) : (
        <div className="space-y-3">
          {initial.map((p) => (
            <PostCard key={p.id} post={p} me={me} />
          ))}
        </div>
      )}
    </div>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="size-9 shrink-0 rounded-full object-cover" />
  }
  return <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 font-display font-bold text-primary">{name.charAt(0).toUpperCase()}</div>
}

function Composer({ me }: { me: { displayName: string; avatarUrl: string | null } }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function post() {
    if (!body.trim()) return
    setErr(null)
    start(async () => {
      const r = await createPostAction(body.trim())
      if (r.error) setErr(r.error)
      else {
        setBody('')
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex gap-3">
        <Avatar name={me.displayName} url={me.avatarUrl} />
        <div className="min-w-0 grow">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Share an update, a win, or something useful with the club…"
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={post}
              disabled={pending || !body.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Post
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PostCard({ post, me }: { post: FeedPost; me: Me }) {
  const [pending, start] = useTransition()
  const [myReaction, setMyReaction] = useState<string | null>(post.myReaction)
  const [count, setCount] = useState(post.reactionCount)
  const [showComments, setShowComments] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount)

  function react(type: string) {
    // optimistic
    const prev = { myReaction, count }
    if (myReaction === type) {
      setMyReaction(null)
      setCount((c) => Math.max(0, c - 1))
    } else {
      setCount((c) => (myReaction ? c : c + 1))
      setMyReaction(type)
    }
    start(async () => {
      const r = await reactAction(post.id, type)
      if ('error' in r) {
        setMyReaction(prev.myReaction)
        setCount(prev.count)
      } else {
        setMyReaction(r.myReaction)
        setCount(r.reactionCount)
      }
    })
  }

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
        <div className="min-w-0">
          <a href={`/contractor/u/${post.author.userId}`} className="font-display text-sm font-semibold hover:text-primary">{post.author.displayName}</a>
          <span className="ml-1.5 text-xs text-muted-foreground">· {timeAgo(post.createdAt)}</span>
        </div>
        {post.kind !== 'update' && (
          <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">{post.kind}</span>
        )}
      </div>

      <p className="mt-2.5 whitespace-pre-line text-sm text-foreground/90">{post.body}</p>
      {post.linkUrl && (
        <a href={post.linkUrl} className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/5">
          {post.linkLabel ?? 'View'} →
        </a>
      )}

      <div className="mt-3 flex items-center gap-1 border-t border-border pt-2.5">
        {REACTIONS.map((r) => {
          const on = myReaction === r.type
          return (
            <button
              key={r.type}
              type="button"
              onClick={() => react(r.type)}
              disabled={pending}
              title={r.label}
              className={`grid size-8 place-items-center rounded-md text-base transition hover:bg-muted ${on ? 'bg-primary/10 ring-1 ring-primary/40' : ''}`}
            >
              {r.emoji}
            </button>
          )
        })}
        {count > 0 && <span className="ml-1 text-xs text-muted-foreground">{count}</span>}
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition hover:bg-muted ${showComments ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <MessageSquare className="size-3.5" /> {commentCount}
        </button>
      </div>

      {showComments && <CommentThread postId={post.id} me={me} onAdded={() => setCommentCount((c) => c + 1)} />}
    </article>
  )
}

function CommentThread({ postId, me, onAdded }: { postId: string; me: Me; onAdded: () => void }) {
  const [comments, setComments] = useState<CommentView[] | null>(null)
  const [pending, start] = useTransition()
  const [replyTo, setReplyTo] = useState<string | null>(null)

  useEffect(() => {
    loadCommentsAction(postId).then(setComments)
  }, [postId])

  function add(body: string, parentId?: string) {
    start(async () => {
      const r = await addCommentAction(postId, body, parentId)
      if (!r.error) {
        onAdded()
        setReplyTo(null)
        setComments(await loadCommentsAction(postId))
      }
    })
  }

  const top = (comments ?? []).filter((c) => !c.parentId)
  const repliesOf = (id: string) => (comments ?? []).filter((c) => c.parentId === id)

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {comments === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        top.map((c) => (
          <div key={c.id} className="space-y-2">
            <CommentRow c={c} onReply={() => setReplyTo(replyTo === c.id ? null : c.id)} />
            {repliesOf(c.id).map((r) => (
              <div key={r.id} className="ml-9">
                <CommentRow c={r} />
              </div>
            ))}
            {replyTo === c.id && (
              <div className="ml-9">
                <CommentComposer me={me} placeholder={`Reply to ${c.author.displayName}…`} onSubmit={(b) => add(b, c.id)} pending={pending} />
              </div>
            )}
          </div>
        ))
      )}
      <CommentComposer me={me} placeholder="Add a comment…" onSubmit={(b) => add(b)} pending={pending} />
    </div>
  )
}

function CommentRow({ c, onReply }: { c: CommentView; onReply?: () => void }) {
  return (
    <div className="flex gap-2">
      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{c.author.displayName.charAt(0).toUpperCase()}</div>
      <div className="min-w-0 grow rounded-xl bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <a href={`/contractor/u/${c.author.userId}`} className="text-xs font-semibold hover:text-primary">{c.author.displayName}</a>
          <span className="text-[10px] text-muted-foreground">· {timeAgo(c.createdAt)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-line text-sm">{c.body}</p>
        {onReply && (
          <button type="button" onClick={onReply} className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary">
            <CornerDownRight className="size-3" /> Reply
          </button>
        )}
      </div>
    </div>
  )
}

function CommentComposer({ me, placeholder, onSubmit, pending }: { me: Me; placeholder: string; onSubmit: (b: string) => void; pending: boolean }) {
  const [body, setBody] = useState('')
  const submit = () => {
    if (!body.trim()) return
    onSubmit(body.trim())
    setBody('')
  }
  return (
    <div className="flex gap-2">
      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{me.displayName.charAt(0).toUpperCase()}</div>
      <div className="flex grow gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder={placeholder}
          className="h-8 grow rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
        />
        <button type="button" onClick={submit} disabled={pending || !body.trim()} className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </button>
      </div>
    </div>
  )
}

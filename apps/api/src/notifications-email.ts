/**
 * Notification email DIGEST — a low-spam roll-up of each recipient's UNREAD, not-yet-emailed notifications,
 * run on a worker cron. Each notification is emailed at most once (emailed_at), regardless of send outcome,
 * so a key-less run or a bounce can't reprocess it forever (the in-app bell already delivered it). Recipients
 * who hit the one-click unsubscribe (HMAC-token verified, no login) are skipped. Imported by the worker
 * (runNotificationDigest) and the api router (unsubscribe).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@contractor/db'
import { env } from './env'
import { getUserEmail } from './clerk'
import { sendEmail } from './clients/resend'

const SECRET = env.NOTIFICATIONS_UNSUB_SECRET ?? env.CLERK_SECRET_KEY ?? 'reely-notify-dev'
const MAX_NOTIFICATIONS = 2000

/** Stateless one-click-unsubscribe token: HMAC(secret, userId). No DB lookup needed to mint or verify. */
export function unsubToken(userId: string): string {
  return createHmac('sha256', SECRET).update(userId).digest('hex').slice(0, 32)
}
export function verifyUnsub(userId: string, token: string): boolean {
  const expected = unsubToken(userId)
  if (typeof token !== 'string' || token.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}
export async function setUnsubscribed(userId: string): Promise<void> {
  await prisma.notificationPref.upsert({ where: { userId }, create: { userId, emailUnsubscribed: true }, update: { emailUnsubscribed: true } })
}

type Row = { id: string; userId: string; payload: unknown; createdAt: Date }
const str = (p: unknown, k: string): string | null => { const v = (p as Record<string, unknown>)?.[k]; return typeof v === 'string' ? v : null }

function buildDigest(firstName: string | null, userId: string, items: Row[]): { subject: string; html: string; text: string } {
  const n = items.length
  const subject = n === 1 ? `1 update on your Reely contract` : `${n} updates on your Reely contracts`
  const hi = firstName ? `Hi ${firstName},` : 'Hi,'
  const lines = items.slice(0, 10).map((i) => {
    const title = str(i.payload, 'title') ?? 'Update'
    const ct = str(i.payload, 'contractTitle')
    return ct ? `${title} — ${ct}` : title
  })
  const more = n > 10 ? `…and ${n - 10} more.` : ''
  const appUrl = `${env.APP_BASE_URL}/contractor/notifications`
  const unsubUrl = `${env.APP_BASE_URL}/contractor/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubToken(userId)}`

  const text = [hi, '', `You have ${n} unread ${n === 1 ? 'update' : 'updates'}:`, '', ...lines.map((l) => `• ${l}`), more, '', `See them all: ${appUrl}`, '', `Unsubscribe from these emails: ${unsubUrl}`].filter(Boolean).join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:520px">
    <p>${hi}</p>
    <p>You have <strong>${n}</strong> unread ${n === 1 ? 'update' : 'updates'} on Reely:</p>
    <ul style="padding-left:18px">${lines.map((l) => `<li style="margin:4px 0">${escapeHtml(l)}</li>`).join('')}</ul>
    ${more ? `<p style="color:#666">${more}</p>` : ''}
    <p style="margin:20px 0"><a href="${appUrl}" style="background:#111;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;display:inline-block">View your notifications</a></p>
    <p style="color:#999;font-size:12px;margin-top:28px">You're receiving this because there's activity on your Reely contracts. <a href="${unsubUrl}" style="color:#999">Unsubscribe</a>.</p>
  </div>`
  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Roll up unread, un-emailed notifications per recipient → one digest email each → mark them emailed. */
export async function runNotificationDigest(): Promise<{ recipients: number; emails: number; notifications: number }> {
  const rows = (await prisma.notification.findMany({
    where: { readAt: null, emailedAt: null },
    orderBy: { createdAt: 'asc' },
    take: MAX_NOTIFICATIONS,
    select: { id: true, userId: true, payload: true, createdAt: true },
  })) as Row[]
  if (rows.length === 0) return { recipients: 0, emails: 0, notifications: 0 }

  const byUser = new Map<string, Row[]>()
  for (const r of rows) {
    const list = byUser.get(r.userId)
    if (list) list.push(r)
    else byUser.set(r.userId, [r])
  }

  let emails = 0
  const now = new Date()
  for (const [userId, items] of byUser) {
    try {
      const pref = await prisma.notificationPref.findUnique({ where: { userId }, select: { emailUnsubscribed: true } })
      if (!pref?.emailUnsubscribed) {
        const who = await getUserEmail(userId)
        if (who) {
          const mail = buildDigest(who.firstName, userId, items)
          const r = await sendEmail({ to: who.email, subject: mail.subject, html: mail.html, text: mail.text })
          if (r.ok && !r.stubbed) emails++
        }
      }
    } catch (e) {
      console.error('[digest] recipient failed', userId, (e as Error).message)
    }
    // Mark emailed regardless of outcome — the in-app bell already delivered; never reprocess this batch.
    await prisma.notification.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { emailedAt: now } })
  }
  return { recipients: byUser.size, emails, notifications: rows.length }
}

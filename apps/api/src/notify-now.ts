/**
 * notify-now — an IMMEDIATE, high-signal notification: writes an in-app row (pre-stamped `emailedAt` so the
 * daily digest won't re-send it) AND sends a transactional email right now. For money / needs-action /
 * conversion events (you're vetted, you got paid, add a card, your bid was accepted) — distinct from the
 * batched ceremony digest in `notify.ts`. Best-effort: a notification hiccup never blocks the action.
 *
 * The two existing immediate senders (payments/notices.ts) inline this same shape; this is the shared,
 * CTA-flexible version the rest of the app uses. Email-interpolated text is HTML-escaped (the email-injection
 * hardening from the 2026-06-19 security pass).
 */
import { prisma } from '@contractor/db'
import { getUserEmail } from './clerk'
import { sendEmail } from './clients/resend'
import { env } from './env'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type NotifyNow = {
  type: string // the notification row `type` (e.g. 'identity.vetted', 'payment.received')
  title: string // in-app row title (+ email subject when `subject` is omitted)
  subject?: string
  lines: string[] // email body paragraphs
  ctaHref?: string | null // email button href (default: the contractor dashboard; null = no button, e.g. a Board-side client we can't deep-link)
  ctaLabel?: string
  payload?: Record<string, unknown> // extra in-app payload (e.g. { contractId, amount })
}

export async function notifyNow(userId: string, opts: NotifyNow): Promise<void> {
  await prisma.notification
    .create({ data: { userId, type: opts.type, payload: { ceremony: 'account', title: opts.title, ...(opts.payload ?? {}) }, emailedAt: new Date() } })
    .catch(() => {})
  const who = await getUserEmail(userId).catch(() => null)
  if (!who) return
  // ctaHref === null → omit the button (we can't deep-link this recipient, e.g. a client who lives in Board).
  const href = opts.ctaHref === null ? null : (opts.ctaHref ?? `${env.APP_BASE_URL}/contractor`)
  const label = esc(opts.ctaLabel ?? 'Open Reely')
  const name = esc(who.firstName ?? 'there')
  const button = href ? `<p style="margin-top:18px"><a href="${href}" style="background:#111;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;display:inline-block">${label}</a></p>` : ''
  const text = [`Hi ${who.firstName ?? 'there'},`, '', ...opts.lines, '', '— Reely'].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;max-width:520px"><p>Hi ${name},</p>${opts.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${button}<p style="color:#888">— Reely</p></div>`
  await sendEmail({ to: who.email, subject: opts.subject ?? opts.title, html, text }).catch(() => {})
}

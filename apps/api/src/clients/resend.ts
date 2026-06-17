/**
 * Minimal Resend sender (no SDK — a single fetch to the REST API), mirrored from the catalog/newsletter
 * pattern. No-ops + logs when RESEND_API_KEY is unset, so local dev and key-less prod still run the digest
 * end-to-end (the in-app bell already delivered; email is best-effort). Sends multipart (html + text) for
 * deliverability, with an optional Reply-To.
 */
import { env } from '../env'

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<{ ok: boolean; stubbed?: boolean }> {
  if (!env.RESEND_API_KEY) {
    console.log(`[resend stub] → ${msg.to}: ${msg.subject}`)
    return { ok: true, stubbed: true }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.NOTIFICATIONS_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo || env.NOTIFICATIONS_REPLY_TO ? { reply_to: msg.replyTo ?? env.NOTIFICATIONS_REPLY_TO } : {}),
      }),
    })
    if (!res.ok) {
      console.error(`[resend] ${res.status}: ${await res.text().catch(() => '')}`)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('[resend] send failed:', (e as Error).message)
    return { ok: false }
  }
}

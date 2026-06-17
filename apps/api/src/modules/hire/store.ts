/**
 * hire — the inbound "Request to hire" path from a PUBLIC profile. An anonymous visitor on /pro/[slug] submits a
 * lead; it lands as a hire_request the contractor reads + handles, plus an in-app notification and an email. The
 * formal contract is still struck through Board; this is the top-of-funnel contact channel a contractor can share.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'
import { getUserEmail } from '../../clerk'
import { sendEmail } from '../../clients/resend'
import { env } from '../../env'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type HireRequestInput = { fromName: string; fromEmail: string; message: string; projectType?: string | null; budget?: string | null }
export type CleanHireRequest = { fromName: string; fromEmail: string; message: string; projectType: string | null; budget: string | null }

/** PURE validation + normalization of an inbound hire request. Trims, length-bounds, lowercases the email and
 *  checks its shape. Returns the clean record or a field error — no DB, so it's unit-tested directly. */
export function validateHireRequest(input: HireRequestInput): { value: CleanHireRequest } | { error: string } {
  const fromName = (input.fromName ?? '').trim()
  if (fromName.length < 1 || fromName.length > 80) return { error: 'invalid_name' }
  const fromEmail = (input.fromEmail ?? '').trim().toLowerCase()
  if (fromEmail.length > 160 || !EMAIL_RE.test(fromEmail)) return { error: 'invalid_email' }
  const message = (input.message ?? '').trim()
  if (message.length < 1 || message.length > 2000) return { error: 'invalid_message' }
  const projectType = (input.projectType ?? '').trim().slice(0, 120) || null
  const budget = (input.budget ?? '').trim().slice(0, 120) || null
  return { value: { fromName, fromEmail, message, projectType, budget } }
}

/** Minimal HTML-escape for the user-supplied fields we render into the notification email. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** PUBLIC: capture a hire lead for the public profile at `slug`. Only public profiles are contactable. */
export async function requestHire(slug: string, input: HireRequestInput): Promise<{ ok: true } | { error: string }> {
  const v = validateHireRequest(input)
  if ('error' in v) return v
  const profile = await prisma.contractorProfile.findFirst({
    where: { publicSlug: slug.toLowerCase(), isPublic: true },
    select: { clerkUserId: true, displayName: true },
  })
  if (!profile) return { error: 'not_found' }

  const req = await prisma.hireRequest.create({
    data: { contractorUserId: profile.clerkUserId, fromName: v.value.fromName, fromEmail: v.value.fromEmail, message: v.value.message, projectType: v.value.projectType, budget: v.value.budget },
    select: { id: true },
  })

  // In-app bell — no contractId; the feed links a 'hire' notification to the requests inbox.
  await prisma.notification.create({
    data: { userId: profile.clerkUserId, type: 'hire.request', payload: { ceremony: 'hire', title: `New hire request from ${v.value.fromName}` } },
  }).catch(() => {})

  // Email the contractor the lead (fire-and-forget; stubbed when RESEND_API_KEY is unset).
  const who = await getUserEmail(profile.clerkUserId)
  if (who) {
    const detail = [
      `<strong>From:</strong> ${esc(v.value.fromName)} (${esc(v.value.fromEmail)})`,
      v.value.projectType ? `<strong>Project:</strong> ${esc(v.value.projectType)}` : null,
      v.value.budget ? `<strong>Budget:</strong> ${esc(v.value.budget)}` : null,
    ].filter(Boolean).join('<br/>')
    await sendEmail({
      to: who.email,
      replyTo: v.value.fromEmail,
      subject: `New hire request from ${v.value.fromName}`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;max-width:560px"><p>Hi ${who.firstName ?? 'there'},</p><p>Someone asked to hire you via your public profile.</p><p>${detail}</p><p style="white-space:pre-line;border-left:3px solid #ddd;padding-left:12px;color:#333">${esc(v.value.message)}</p><p>Reply to this email to reach them directly.</p><p style="color:#888">— Reely</p></div>`,
      text: `Hi ${who.firstName ?? 'there'},\n\nSomeone asked to hire you via your public profile.\n\nFrom: ${v.value.fromName} (${v.value.fromEmail})\n${v.value.projectType ? `Project: ${v.value.projectType}\n` : ''}${v.value.budget ? `Budget: ${v.value.budget}\n` : ''}\n${v.value.message}\n\nReply to this email to reach them directly.\n\n— Reely`,
    }).catch(() => {})
  }

  await emit('hire', 'hire.requested', profile.clerkUserId, { hireRequestId: req.id }, 'system')
  return { ok: true }
}

export type HireRequestView = { id: string; fromName: string; fromEmail: string; message: string; projectType: string | null; budget: string | null; status: string; createdAt: string }

/** The contractor's own inbound leads, newest first. */
export async function listHireRequests(clerkUserId: string): Promise<HireRequestView[]> {
  const rows = await prisma.hireRequest.findMany({ where: { contractorUserId: clerkUserId }, orderBy: { createdAt: 'desc' }, take: 200 })
  return rows.map((r) => ({ id: r.id, fromName: r.fromName, fromEmail: r.fromEmail, message: r.message, projectType: r.projectType, budget: r.budget, status: r.status, createdAt: r.createdAt.toISOString() }))
}

/** Mark a lead handled / new again (scoped to the owner). */
export async function setHireRequestStatus(clerkUserId: string, id: string, status: 'new' | 'handled' | 'archived'): Promise<{ ok: true } | { error: string }> {
  const r = await prisma.hireRequest.findUnique({ where: { id }, select: { contractorUserId: true } })
  if (!r || r.contractorUserId !== clerkUserId) return { error: 'forbidden' }
  await prisma.hireRequest.update({ where: { id }, data: { status, handledAt: status === 'handled' ? new Date() : null } })
  return { ok: true }
}

/** Count of un-handled leads, for a nav badge. */
export async function newHireRequestCount(clerkUserId: string): Promise<number> {
  return prisma.hireRequest.count({ where: { contractorUserId: clerkUserId, status: 'new' } })
}

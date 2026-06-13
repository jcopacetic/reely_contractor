'use server'

import { apiMutate, apiQuery } from '@/lib/api'

/** Submit an application (any signed-in user). */
export async function applyAction(): Promise<{ ok: true } | { error: string }> {
  try {
    await apiMutate('identity.submit')
    return { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Redeem an invite code → an invite-sourced application. */
export async function redeemInviteAction(code: string): Promise<{ ok: true } | { error: string }> {
  try {
    const r = await apiMutate<{ error?: string }>('identity.redeemInvite', { code })
    if (r && 'error' in r && r.error) return { error: r.error }
    return { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Profile / onboarding ─────────────────────────────────────────────────────────
type Link = { label: string; url: string }
type Result = { ok?: true; error?: string; missing?: string[] }

export async function saveProfileAction(input: {
  firstName?: string
  lastName?: string
  company?: string | null
  position?: string | null
  headline?: string | null
  bio?: string | null
  links?: Link[]
  categoryIds?: string[]
  publicSlug?: string | null
}): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.update', input)
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function checkSlugAction(slug: string): Promise<{ available: boolean; reason?: 'invalid' | 'taken'; error?: string }> {
  try {
    return await apiQuery<{ available: boolean; reason?: 'invalid' | 'taken' }>('profile.checkSlug', { slug })
  } catch (e) {
    return { available: false, error: (e as Error).message }
  }
}

export async function setPublicAction(isPublic: boolean): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.setPublic', { isPublic })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function acceptDocAction(docKey: string): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.acceptDoc', { docKey })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function completeOnboardingAction(): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.completeOnboarding')
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Feed ─────────────────────────────────────────────────────────────────────────
export async function createPostAction(body: string): Promise<{ ok?: true; error?: string }> {
  try {
    await apiMutate('feed.createPost', { body })
    return { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function reactAction(
  postId: string,
  type: string,
): Promise<{ myReaction: string | null; reactionCount: number } | { error: string }> {
  try {
    return await apiMutate<{ myReaction: string | null; reactionCount: number }>('feed.react', { postId, type })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

type CommentView = {
  id: string
  parentId: string | null
  author: { userId: string; displayName: string; avatarUrl: string | null; publicSlug: string | null }
  body: string
  createdAt: string
}

export async function loadCommentsAction(postId: string): Promise<CommentView[]> {
  try {
    return (await apiQuery<CommentView[]>('feed.comments', { postId })) ?? []
  } catch {
    return []
  }
}

export async function addCommentAction(postId: string, body: string, parentId?: string): Promise<{ ok?: true; error?: string }> {
  try {
    await apiMutate('feed.addComment', { postId, body, ...(parentId ? { parentId } : {}) })
    return { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Graph (follows) ──────────────────────────────────────────────────────────────
export async function toggleFollowAction(userId: string): Promise<{ following: boolean; followerCount: number } | { error: string }> {
  try {
    return await apiMutate<{ following: boolean; followerCount: number }>('graph.toggleFollow', { userId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Chat rooms ──────────────────────────────────────────────────────────────────
type Participant = { userId: string; displayName: string; avatarUrl: string | null }
type RoomMsg = { id: string; body: string; fromMe: boolean; senderUserId: string; senderLabel: string; fromTenant: boolean; createdAt: string }
type Kind = 'direct' | 'hire' | 'team'

/** Find or create the direct (1:1) room with a contractor (the "Message" button on profiles). */
export async function openThreadAction(userId: string): Promise<{ roomId: string; other: Participant } | { error: string }> {
  try {
    return await apiMutate<{ roomId: string; other: Participant }>('dm.open', { userId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function loadMessagesAction(roomId: string, before?: string): Promise<{ messages: RoomMsg[]; title: string; kind: Kind } | { error: string }> {
  try {
    return await apiQuery<{ messages: RoomMsg[]; title: string; kind: Kind }>('dm.messages', { roomId, ...(before ? { before } : {}) })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function sendDmAction(roomId: string, body: string): Promise<{ id: string } | { error: string }> {
  try {
    return await apiMutate<{ id: string }>('dm.send', { roomId, body })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Marketplace / work-loop ───────────────────────────────────────────────────────
type BudgetType = 'hourly' | 'fixed'

export async function createListingAction(input: {
  title: string
  description: string
  categoryIds: string[]
  budgetType: BudgetType
  budgetAmount?: number | null
}): Promise<{ listingId: string } | { error: string }> {
  try {
    return await apiMutate<{ listingId: string }>('marketplace.createListing', input)
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function closeListingAction(listingId: string): Promise<{ ok?: true; error?: string }> {
  try {
    return await apiMutate('marketplace.closeListing', { listingId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function submitBidAction(
  listingId: string,
  bid: { rateType: BudgetType; amount: number; hoursEstimate?: number | null; message?: string | null },
): Promise<{ bidId: string } | { error: string }> {
  try {
    return await apiMutate<{ bidId: string }>('marketplace.submitBid', { listingId, ...bid })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function withdrawBidAction(bidId: string): Promise<{ ok?: true; error?: string }> {
  try {
    return await apiMutate('marketplace.withdrawBid', { bidId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

async function bidAction(proc: 'marketplace.counterBid' | 'marketplace.denyBid' | 'marketplace.acceptBid', bidId: string): Promise<{ ok?: true; error?: string }> {
  try {
    return await apiMutate(proc, { bidId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}
export async function counterBidAction(bidId: string) {
  return bidAction('marketplace.counterBid', bidId)
}
export async function denyBidAction(bidId: string) {
  return bidAction('marketplace.denyBid', bidId)
}

/** Accept a bid → mark it accepted (marketplace) AND turn it into a contract (best-effort). */
export async function acceptBidAction(bidId: string): Promise<{ ok?: true; error?: string; contractId?: string }> {
  try {
    await apiMutate('marketplace.acceptBid', { bidId })
    const c = await apiMutate<{ contractId?: string; error?: string }>('contracts.createFromBid', { bidId }).catch(() => ({}) as { contractId?: string })
    return { ok: true, contractId: c && 'contractId' in c ? c.contractId : undefined }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Contracts ─────────────────────────────────────────────────────────────────────
export async function createContractItemAction(
  contractId: string,
  item: { kind: 'milestone' | 'scope_add' | 'deliverable' | 'note'; title: string; description?: string | null; amount?: number | null },
): Promise<{ itemId?: string; error?: string }> {
  try {
    return await apiMutate<{ itemId: string }>('contracts.addItem', { contractId, ...item })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateContractStatusAction(contractId: string, status: 'active' | 'paused' | 'completed' | 'cancelled'): Promise<{ ok?: true; error?: string }> {
  try {
    return await apiMutate('contracts.updateStatus', { contractId, status })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Time tracking ───────────────────────────────────────────────────────────────────
type TimeResult = { entryId?: string; ok?: true; durationSeconds?: number; error?: string }

export async function startTimerAction(contractId: string, description?: string | null): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.start', { contractId, description: description ?? null })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function stopTimerAction(entryId: string): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.stop', { entryId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function cancelTimerAction(entryId: string): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.cancelRunning', { entryId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function addManualTimeAction(
  contractId: string,
  input: { startedAt: string; endedAt: string; description?: string | null },
): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.manualEntry', { contractId, ...input })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function approveTimeAction(entryId: string): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.approve', { entryId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function unapproveTimeAction(entryId: string): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.unapprove', { entryId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Client contests an entry (won't bill until resolved). */
export async function disputeTimeAction(entryId: string, reason: string): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.dispute', { entryId, reason })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Client withdraws a dispute (back to pending). */
export async function withdrawDisputeAction(entryId: string): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.withdrawDispute', { entryId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Contractor deletes own tracked time (un-billed) — also how they concede a dispute. */
export async function deleteTimeAction(entryId: string): Promise<TimeResult> {
  try {
    return await apiMutate<TimeResult>('time.deleteEntry', { entryId })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── extension tokens (the browser timer's credential) ────────────────────────────
/** Mint a new extension token — returns the plaintext ONCE for the contractor to paste into the extension. */
export async function mintExtensionTokenAction(label: string): Promise<{ token?: string; error?: string }> {
  try {
    return await apiMutate<{ token: string }>('extensionToken.mint', { label: label.trim() || undefined })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function revokeExtensionTokenAction(id: string): Promise<{ ok?: true; error?: string }> {
  try {
    return await apiMutate<{ ok: true }>('extensionToken.revoke', { id })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

type ActivityView = { id: string; capturedAt: string; activityPct: number | null; title: string | null; screenshotUrl: string | null }
/** Load an entry's plugin-timer evidence (activity samples + signed screenshot URLs). */
export async function loadEvidenceAction(entryId: string): Promise<{ samples: ActivityView[] } | { error: string }> {
  try {
    const r = await apiQuery<{ samples: ActivityView[] } | null>('time.entryEvidence', { entryId })
    return r ?? { samples: [] }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Payments / payouts ────────────────────────────────────────────────────────────
/** Ensure the contractor's Stripe Connect (Express) account + get an onboarding link to complete KYC. */
export async function startPayoutOnboardingAction(): Promise<{ url?: string; error?: string }> {
  try {
    return await apiMutate<{ url: string }>('payments.startOnboarding')
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** A participant contests a billing cycle (blocks its charge until an admin resolves). */
export async function raiseCycleDisputeAction(billingCycleId: string, reason: string): Promise<{ ok?: true; error?: string }> {
  try {
    const r = await apiMutate<{ ok?: true; error?: string }>('payments.raiseDispute', { billingCycleId, reason })
    return r && 'error' in r && r.error ? { error: r.error } : { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

type ListingCard = {
  id: string; ownerUserId: string; boardPartRef: string | null; title: string; description: string
  categoryIds: string[]; budgetType: BudgetType; budgetAmount: number | null; status: string; createdAt: string; bidCount: number; isOwner: boolean
}

/** Re-query the job-feed with filters (client-driven browse). */
export async function loadListingsAction(filters: { categoryIds?: string[]; budgetType?: BudgetType; before?: string }): Promise<ListingCard[]> {
  try {
    return (await apiQuery<ListingCard[]>('jobFeed.list', filters)) ?? []
  } catch {
    return []
  }
}

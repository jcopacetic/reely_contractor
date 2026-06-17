/** Starter templates for the optional contract agreement docs. A party picks one, then customizes the text
 *  before attaching it. These are plain starting points to edit — not legal advice. */
export type DocKind = 'nda' | 'ip_assignment' | 'confidentiality' | 'ic_agreement' | 'non_solicit' | 'custom'

export const DOC_TEMPLATES: Record<DocKind, { label: string; title: string; body: string }> = {
  nda: {
    label: 'Mutual NDA',
    title: 'Mutual Non-Disclosure Agreement',
    body: `Both parties to this contract may share confidential or proprietary information ("Confidential Information") in the course of the work.

1. Each party agrees to keep the other's Confidential Information secret and to use it only to perform this contract.
2. Confidential Information does not include anything that is public, already known, or independently developed.
3. These obligations continue for [2] years after the contract ends.

This is a starting template — edit the terms to fit your engagement.`,
  },
  ip_assignment: {
    label: 'IP Assignment (Work for Hire)',
    title: 'Intellectual Property Assignment',
    body: `The contractor agrees that all work product, deliverables, and intellectual property created for this contract are "work made for hire" and belong to the client upon payment.

1. The contractor assigns to the client all rights, title, and interest in the deliverables created under this contract.
2. The contractor will sign any further documents reasonably needed to perfect that assignment.
3. The contractor may retain general skills, know-how, and pre-existing tools they bring to the work.

This is a starting template — edit the terms to fit your engagement.`,
  },
  confidentiality: {
    label: 'Confidentiality',
    title: 'Confidentiality Agreement',
    body: `The contractor will receive confidential information from the client and agrees to protect it.

1. The contractor will keep the client's Confidential Information secret and use it only for this contract.
2. The contractor will not disclose it to any third party without the client's written consent.
3. On request or at the end of the contract, the contractor will return or destroy the Confidential Information.

This is a starting template — edit the terms to fit your engagement.`,
  },
  ic_agreement: {
    label: 'Independent Contractor',
    title: 'Independent Contractor Agreement',
    body: `This confirms the working relationship between the parties.

1. The contractor is an independent contractor, not an employee, partner, or agent of the client.
2. The contractor controls how the work is done and is responsible for their own taxes, insurance, and expenses.
3. Nothing here creates an employment relationship or entitles the contractor to employee benefits.

This is a starting template — edit the terms to fit your engagement.`,
  },
  non_solicit: {
    label: 'Non-Solicitation',
    title: 'Non-Solicitation Agreement',
    body: `For [12] months after this contract ends:

1. Neither party will solicit or hire the other's employees or contractors involved in this work.
2. Neither party will encourage the other's clients or staff to end their relationship with that party.

This does not prevent general advertising not targeted at the other party's people.

This is a starting template — edit the terms to fit your engagement.`,
  },
  custom: { label: 'Custom document', title: '', body: '' },
}

export const DOC_KIND_LABEL: Record<DocKind, string> = Object.fromEntries(
  (Object.keys(DOC_TEMPLATES) as DocKind[]).map((k) => [k, DOC_TEMPLATES[k].label]),
) as Record<DocKind, string>

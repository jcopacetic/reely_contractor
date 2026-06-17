import { describe, it, expect } from 'vitest'
import { cleanIndustries, cleanTools } from './store'

// Pure sanitizers for the catalog-backed profile facets (NO DB).

describe('cleanIndustries', () => {
  it('keeps well-formed { slug, label } refs', () => {
    expect(cleanIndustries([{ slug: 'fintech', label: 'Fintech' }, { slug: 'payments', label: 'Payments' }]))
      .toEqual([{ slug: 'fintech', label: 'Fintech' }, { slug: 'payments', label: 'Payments' }])
  })
  it('lowercases the slug and trims/caps the label', () => {
    const r = cleanIndustries([{ slug: 'HealthTech', label: '  Health Tech  ' }])
    expect(r[0]).toEqual({ slug: 'healthtech', label: 'Health Tech' })
  })
  it('drops bad slugs, empty labels, and dedupes', () => {
    expect(cleanIndustries([
      { slug: 'ok-slug', label: 'Fine' },
      { slug: 'bad slug', label: 'space' },
      { slug: 'no-label', label: '' },
      { slug: 'ok-slug', label: 'Dup' },
    ])).toEqual([{ slug: 'ok-slug', label: 'Fine' }])
  })
  it('non-array → []; caps at 20', () => {
    expect(cleanIndustries('nope')).toEqual([])
    expect(cleanIndustries(Array.from({ length: 30 }, (_, i) => ({ slug: `s${i}`, label: `L${i}` })))).toHaveLength(20)
  })
})

describe('cleanTools', () => {
  it('keeps well-formed company refs, null domain when blank', () => {
    expect(cleanTools([
      { id: 'org-1', name: 'Stripe', slug: 'stripe', domain: 'stripe.com' },
      { id: 'org-2', name: 'HubSpot', slug: 'hubspot', domain: '' },
    ])).toEqual([
      { id: 'org-1', name: 'Stripe', slug: 'stripe', domain: 'stripe.com' },
      { id: 'org-2', name: 'HubSpot', slug: 'hubspot', domain: null },
    ])
  })
  it('drops entries missing id or name, and dedupes by id', () => {
    expect(cleanTools([
      { id: 'a', name: 'Keep', slug: 'k', domain: null },
      { id: '', name: 'NoId', slug: 'x', domain: null },
      { id: 'b', name: '', slug: 'y', domain: null },
      { id: 'a', name: 'Dup', slug: 'k', domain: null },
    ])).toEqual([{ id: 'a', name: 'Keep', slug: 'k', domain: null }])
  })
  it('non-array → []; caps at 30', () => {
    expect(cleanTools(null)).toEqual([])
    expect(cleanTools(Array.from({ length: 40 }, (_, i) => ({ id: `id${i}`, name: `N${i}`, slug: `s${i}`, domain: null })))).toHaveLength(30)
  })
})

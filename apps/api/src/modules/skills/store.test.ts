import { describe, it, expect } from 'vitest'
import { slugifySkill, cleanSkillName } from './store'

describe('slugifySkill', () => {
  it('lowercases, turns & into and, and dashes the rest', () => {
    expect(slugifySkill('Web Development')).toBe('web-development')
    expect(slugifySkill('SEO & Growth')).toBe('seo-and-growth')
    expect(slugifySkill('UI/UX Design')).toBe('ui-ux-design')
    expect(slugifySkill('React & Next.js')).toBe('react-and-next-js')
  })
  it('trims leading/trailing separators', () => {
    expect(slugifySkill('  .NET Development  ')).toBe('net-development')
    expect(slugifySkill('C++')).toBe('c')
  })
})

describe('cleanSkillName', () => {
  it('normalizes whitespace and returns name + slug', () => {
    expect(cleanSkillName('  Rust   Development ')).toEqual({ name: 'Rust Development', slug: 'rust-development' })
  })
  it('rejects too-short / too-long names', () => {
    expect(cleanSkillName('a')).toEqual({ error: 'invalid_name' })
    expect(cleanSkillName('x'.repeat(41))).toEqual({ error: 'invalid_name' })
  })
  it('rejects names that slugify to nothing usable', () => {
    expect(cleanSkillName('!!')).toEqual({ error: 'invalid_name' })
    expect(cleanSkillName('   ')).toEqual({ error: 'invalid_name' })
  })
  it('accepts a 2-char name', () => {
    expect(cleanSkillName('Go')).toEqual({ name: 'Go', slug: 'go' })
  })
})

import { describe, it, expect } from 'vitest'
import { cn, slugify, initials, formatDate } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('resolves tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})

describe('slugify', () => {
  it('converts text to slug', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('handles special characters', () => {
    expect(slugify('Café & Restaurant')).toBe('caf-restaurant')
  })

  it('handles multiple spaces', () => {
    expect(slugify('  multiple   spaces  ')).toBe('multiple-spaces')
  })
})

describe('initials', () => {
  it('extracts initials from name', () => {
    expect(initials('Awaleh Osman')).toBe('AO')
  })

  it('handles single name', () => {
    expect(initials('Awaleh')).toBe('A')
  })

  it('handles three names', () => {
    expect(initials('Jean Pierre Dupont')).toBe('JP')
  })
})

describe('formatDate', () => {
  it('formats date in French', () => {
    const date = new Date('2026-09-02')
    const formatted = formatDate(date, 'fr-FR')
    expect(formatted).toContain('2026')
  })

  it('formats string date', () => {
    const formatted = formatDate('2026-09-02')
    expect(formatted).toContain('2026')
  })
})

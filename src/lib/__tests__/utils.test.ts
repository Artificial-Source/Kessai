import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn', () => {
  it('combines multiple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles undefined and null values', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('handles empty string', () => {
    expect(cn('foo', '', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active')
  })

  it('merges conflicting Tailwind classes (last wins)', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('merges conflicting Tailwind color classes', () => {
    expect(cn('text-destructive', 'text-info')).toBe('text-info')
  })

  it('merges conflicting Tailwind background classes', () => {
    expect(cn('bg-destructive', 'bg-info')).toBe('bg-info')
  })

  it('preserves non-conflicting Tailwind classes', () => {
    expect(cn('p-4', 'mt-2', 'text-sm')).toBe('p-4 mt-2 text-sm')
  })

  it('handles array input', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })
})

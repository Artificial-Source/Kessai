import { describe, it, expect } from 'vitest'
import { categorySchema, categoryFormSchema, DEFAULT_CATEGORY_COLORS } from '../category'

describe('categorySchema', () => {
  const validCategory = {
    id: 'cat-1',
    name: 'Streaming',
    color: '#8b5cf6',
    icon: 'play-circle',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  }

  it('accepts valid category data', () => {
    const result = categorySchema.safeParse(validCategory)
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = categorySchema.safeParse({ ...validCategory, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects name exceeding 50 characters', () => {
    const result = categorySchema.safeParse({ ...validCategory, name: 'a'.repeat(51) })
    expect(result.success).toBe(false)
  })

  it('accepts name at 50 characters', () => {
    const result = categorySchema.safeParse({ ...validCategory, name: 'a'.repeat(50) })
    expect(result.success).toBe(true)
  })

  it('rejects invalid color format', () => {
    const result = categorySchema.safeParse({ ...validCategory, color: 'red' })
    expect(result.success).toBe(false)
  })

  it('rejects color without hash', () => {
    const result = categorySchema.safeParse({ ...validCategory, color: '8b5cf6' })
    expect(result.success).toBe(false)
  })

  it('rejects 3-digit hex color', () => {
    const result = categorySchema.safeParse({ ...validCategory, color: '#fff' })
    expect(result.success).toBe(false)
  })

  it('accepts lowercase hex color', () => {
    const result = categorySchema.safeParse({ ...validCategory, color: '#abcdef' })
    expect(result.success).toBe(true)
  })

  it('accepts uppercase hex color', () => {
    const result = categorySchema.safeParse({ ...validCategory, color: '#ABCDEF' })
    expect(result.success).toBe(true)
  })

  it('rejects empty icon', () => {
    const result = categorySchema.safeParse({ ...validCategory, icon: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing fields', () => {
    const result = categorySchema.safeParse({ id: 'cat-1' })
    expect(result.success).toBe(false)
  })
})

describe('categoryFormSchema', () => {
  const validForm = {
    name: 'Gaming',
    color: '#10b981',
    icon: 'gamepad-2',
  }

  it('accepts valid form data', () => {
    const result = categoryFormSchema.safeParse(validForm)
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = categoryFormSchema.safeParse({ ...validForm, name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name is required')
    }
  })

  it('rejects name exceeding 50 characters', () => {
    const result = categoryFormSchema.safeParse({ ...validForm, name: 'a'.repeat(51) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name too long')
    }
  })

  it('rejects invalid color', () => {
    const result = categoryFormSchema.safeParse({ ...validForm, color: 'invalid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid color')
    }
  })

  it('rejects empty icon', () => {
    const result = categoryFormSchema.safeParse({ ...validForm, icon: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Icon is required')
    }
  })
})

describe('DEFAULT_CATEGORY_COLORS', () => {
  it('contains 10 colors', () => {
    expect(DEFAULT_CATEGORY_COLORS).toHaveLength(10)
  })

  it('all colors are valid 6-digit hex', () => {
    const hexRegex = /^#[0-9A-Fa-f]{6}$/
    DEFAULT_CATEGORY_COLORS.forEach((color) => {
      expect(color).toMatch(hexRegex)
    })
  })

  it('all colors are unique', () => {
    const uniqueColors = new Set(DEFAULT_CATEGORY_COLORS)
    expect(uniqueColors.size).toBe(DEFAULT_CATEGORY_COLORS.length)
  })
})

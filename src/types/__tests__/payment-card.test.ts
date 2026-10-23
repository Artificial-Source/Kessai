import { describe, it, expect } from 'vitest'
import { paymentCardSchema, paymentCardFormSchema, CARD_COLORS } from '../payment-card'

describe('paymentCardSchema', () => {
  const validCard = {
    id: 'card-1',
    name: 'Visa Platinum',
    card_type: 'credit' as const,
    last_four: '4242',
    color: '#3b82f6',
    credit_limit: 5000,
    created_at: '2024-01-01T00:00:00.000Z',
  }

  it('accepts valid card data', () => {
    const result = paymentCardSchema.safeParse(validCard)
    expect(result.success).toBe(true)
  })

  it('accepts debit card type', () => {
    const result = paymentCardSchema.safeParse({ ...validCard, card_type: 'debit' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid card type', () => {
    const result = paymentCardSchema.safeParse({ ...validCard, card_type: 'prepaid' })
    expect(result.success).toBe(false)
  })

  it('accepts null last_four', () => {
    const result = paymentCardSchema.safeParse({ ...validCard, last_four: null })
    expect(result.success).toBe(true)
  })

  it('accepts null credit_limit', () => {
    const result = paymentCardSchema.safeParse({ ...validCard, credit_limit: null })
    expect(result.success).toBe(true)
  })

  it('accepts missing optional fields', () => {
    const { last_four: _, credit_limit: __, created_at: ___, ...minimal } = validCard
    const result = paymentCardSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('rejects missing required fields', () => {
    const result = paymentCardSchema.safeParse({ id: 'card-1' })
    expect(result.success).toBe(false)
  })

  it.each(['abcd', '12x4', '123', '12345'])('rejects non-four-digit suffix %s', (last_four) => {
    expect(paymentCardSchema.safeParse({ ...validCard, last_four }).success).toBe(false)
  })
})

describe('paymentCardFormSchema', () => {
  const validForm = {
    name: 'Visa Platinum',
    card_type: 'credit' as const,
    last_four: '4242',
    color: '#3b82f6',
    credit_limit: 5000,
  }

  it('accepts valid form data', () => {
    const result = paymentCardFormSchema.safeParse(validForm)
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = paymentCardFormSchema.safeParse({ ...validForm, name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Card name is required')
    }
  })

  it('accepts missing optional last_four', () => {
    const { last_four: _, ...noLastFour } = validForm
    const result = paymentCardFormSchema.safeParse(noLastFour)
    expect(result.success).toBe(true)
  })

  it('rejects last_four longer than 4 digits', () => {
    const result = paymentCardFormSchema.safeParse({ ...validForm, last_four: '12345' })
    expect(result.success).toBe(false)
  })

  it.each(['abcd', '12x4', '123'])('rejects non-four-digit suffix %s', (last_four) => {
    expect(paymentCardFormSchema.safeParse({ ...validForm, last_four }).success).toBe(false)
  })

  it('allows an empty optional card suffix', () => {
    expect(paymentCardFormSchema.safeParse({ ...validForm, last_four: '' }).success).toBe(true)
  })

  it('accepts missing optional credit_limit', () => {
    const { credit_limit: _, ...noLimit } = validForm
    const result = paymentCardFormSchema.safeParse(noLimit)
    expect(result.success).toBe(true)
  })

  it('rejects negative credit_limit', () => {
    const result = paymentCardFormSchema.safeParse({ ...validForm, credit_limit: -100 })
    expect(result.success).toBe(false)
  })

  it('rejects zero credit_limit', () => {
    const result = paymentCardFormSchema.safeParse({ ...validForm, credit_limit: 0 })
    expect(result.success).toBe(false)
  })
})

describe('CARD_COLORS', () => {
  it('contains 8 colors', () => {
    expect(CARD_COLORS).toHaveLength(8)
  })

  it('all colors are valid 6-digit hex', () => {
    const hexRegex = /^#[0-9A-Fa-f]{6}$/
    CARD_COLORS.forEach((color) => {
      expect(color).toMatch(hexRegex)
    })
  })

  it('all colors are unique', () => {
    const uniqueColors = new Set(CARD_COLORS)
    expect(uniqueColors.size).toBe(CARD_COLORS.length)
  })
})

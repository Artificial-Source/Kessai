import { describe, it, expect } from 'vitest'
import { paymentFormSchema } from '../payment'
import type { Payment, PaymentFormData } from '../payment'
import { z } from 'zod'

// Re-create the internal schema for testing since _paymentSchema is not exported
const paymentSchema = z.object({
  id: z.string(),
  subscription_id: z.string(),
  amount: z.number(),
  paid_at: z.string(),
  due_date: z.string(),
  status: z.enum(['paid', 'skipped', 'pending']).default('paid'),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
})

const validPayment: Payment = {
  id: 'pay-1',
  subscription_id: 'sub-1',
  amount: 15.99,
  paid_at: '2025-06-01T00:00:00Z',
  due_date: '2025-06-01',
  status: 'paid',
  notes: null,
}

describe('Payment schema', () => {
  it('validates a valid payment object', () => {
    const result = paymentSchema.safeParse(validPayment)
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = paymentSchema.safeParse({ ...validPayment, status: 'overdue' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid statuses', () => {
    const statuses = ['paid', 'skipped', 'pending'] as const
    statuses.forEach((status) => {
      const result = paymentSchema.safeParse({ ...validPayment, status })
      expect(result.success).toBe(true)
    })
  })

  it('defaults status to paid when not provided', () => {
    const { status: _status, ...withoutStatus } = validPayment
    const result = paymentSchema.safeParse(withoutStatus)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('paid')
    }
  })

  it('allows null notes', () => {
    const result = paymentSchema.safeParse({ ...validPayment, notes: null })
    expect(result.success).toBe(true)
  })

  it('allows undefined notes', () => {
    const { notes: _notes, ...withoutNotes } = validPayment
    const result = paymentSchema.safeParse(withoutNotes)
    expect(result.success).toBe(true)
  })

  it('allows optional created_at', () => {
    const result = paymentSchema.safeParse({ ...validPayment, created_at: '2025-06-01T00:00:00Z' })
    expect(result.success).toBe(true)
  })

  it('validates without created_at', () => {
    const result = paymentSchema.safeParse(validPayment)
    expect(result.success).toBe(true)
  })
})

describe('paymentFormSchema', () => {
  const validFormData: PaymentFormData = {
    subscription_id: 'sub-1',
    amount: 15.99,
    paid_at: '2025-06-01',
    due_date: '2025-06-01',
    status: 'paid',
  }

  it('validates valid form data', () => {
    const result = paymentFormSchema.safeParse(validFormData)
    expect(result.success).toBe(true)
  })

  it('rejects empty subscription_id', () => {
    const result = paymentFormSchema.safeParse({ ...validFormData, subscription_id: '' })
    expect(result.success).toBe(false)
  })

  it('rejects negative amount', () => {
    const result = paymentFormSchema.safeParse({ ...validFormData, amount: -5 })
    expect(result.success).toBe(false)
  })

  it('rejects zero amount', () => {
    const result = paymentFormSchema.safeParse({ ...validFormData, amount: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects empty paid_at', () => {
    const result = paymentFormSchema.safeParse({ ...validFormData, paid_at: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty due_date', () => {
    const result = paymentFormSchema.safeParse({ ...validFormData, due_date: '' })
    expect(result.success).toBe(false)
  })

  it('allows optional notes', () => {
    const result = paymentFormSchema.safeParse({ ...validFormData, notes: 'Test note' })
    expect(result.success).toBe(true)
  })

  it('defaults status to paid', () => {
    const { status: _status, ...withoutStatus } = validFormData
    const result = paymentFormSchema.safeParse(withoutStatus)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('paid')
    }
  })
})

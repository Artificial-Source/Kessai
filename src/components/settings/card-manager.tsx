import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { CreditCard, Plus, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { paymentCardFormSchema, CARD_COLORS } from '@/types/payment-card'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { PaymentCard, PaymentCardFormData } from '@/types/payment-card'
import type { CurrencyCode } from '@/lib/currency'

interface CardManagerProps {
  currency: CurrencyCode
}

export function CardManager({ currency }: CardManagerProps) {
  const { cards, fetch, add, update, remove } = usePaymentCardStore()
  const [isAdding, setIsAdding] = useState(false)
  const [editingCard, setEditingCard] = useState<PaymentCard | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PaymentCard | null>(null)

  useEffect(() => {
    fetch()
  }, [fetch])

  const form = useForm<PaymentCardFormData>({
    resolver: zodResolver(paymentCardFormSchema),
    defaultValues: {
      name: '',
      card_type: 'debit',
      last_four: '',
      color: CARD_COLORS[0],
      credit_limit: undefined,
    },
  })

  const handleSubmit = async (data: PaymentCardFormData) => {
    try {
      if (editingCard) {
        await update(editingCard.id, data)
        toast.success('Card updated')
      } else {
        await add(data)
        toast.success('Card added')
      }
      form.reset()
      setIsAdding(false)
      setEditingCard(null)
    } catch {
      toast.error('Failed to save card')
    }
  }

  const handleEdit = (card: PaymentCard) => {
    setEditingCard(card)
    setIsAdding(true)
    form.reset({
      name: card.name,
      card_type: card.card_type,
      last_four: card.last_four || '',
      color: card.color,
      credit_limit: card.credit_limit || undefined,
    })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove(deleteTarget.id)
      toast.success('Card deleted')
    } catch {
      toast.error('Failed to delete card')
    }
    setDeleteTarget(null)
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingCard(null)
    form.reset()
  }

  const cardType = form.watch('card_type')

  return (
    <div className="space-y-4">
      {!isAdding && (
        <Button variant="outline" onClick={() => setIsAdding(true)} className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Add Payment Card
        </Button>
      )}

      {isAdding && (
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="border-border bg-muted/50 space-y-4 rounded-lg border p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-foreground font-medium">
              {editingCard ? 'Edit Card' : 'Add Card'}
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="card-name">Card Name *</Label>
              <Input
                id="card-name"
                placeholder="My Visa Card"
                className="border-border bg-muted/50"
                {...form.register('name')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="card-type">Type *</Label>
              <Select
                value={form.watch('card_type')}
                onValueChange={(value) => form.setValue('card_type', value as 'credit' | 'debit')}
              >
                <SelectTrigger className="border-border bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="last-four">Last 4 Digits</Label>
              <Input
                id="last-four"
                placeholder="1234"
                maxLength={4}
                className="border-border bg-muted/50"
                {...form.register('last_four')}
              />
            </div>

            {cardType === 'credit' && (
              <div className="space-y-2">
                <Label htmlFor="credit-limit">Monthly Limit</Label>
                <Input
                  id="credit-limit"
                  type="number"
                  placeholder="5000"
                  className="border-border bg-muted/50"
                  {...form.register('credit_limit', { valueAsNumber: true })}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Card Color</Label>
            <div className="flex gap-2">
              {CARD_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => form.setValue('color', color)}
                  className={cn(
                    'h-8 w-8 rounded-full transition-all',
                    form.watch('color') === color &&
                      'ring-primary ring-offset-background ring-2 ring-offset-2'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              {editingCard ? 'Update' : 'Add'} Card
            </Button>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {cards.length > 0 && (
        <div className="space-y-2">
          {cards.map((card) => (
            <div
              key={card.id}
              className="border-border bg-muted/50 flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: card.color }}
                >
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-foreground font-medium">{card.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {card.card_type === 'credit' ? 'Credit' : 'Debit'}
                    {card.last_four && ` •••• ${card.last_four}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {card.card_type === 'credit' && card.credit_limit && (
                  <span className="text-muted-foreground mr-2 text-sm">
                    Limit: {formatCurrency(card.credit_limit, currency)}
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(card)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => setDeleteTarget(card)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cards.length === 0 && !isAdding && (
        <p className="text-muted-foreground py-4 text-center text-sm">No payment cards added yet</p>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Card?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Subscriptions using this card will be updated.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}

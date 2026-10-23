import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { CreditCard, Loader2, Pencil, Plus, RotateCw, Trash2, TriangleAlert, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldError, FieldHint } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingsListSkeleton, SettingsSection } from '@/components/settings/settings-section'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { paymentCardFormSchema, CARD_COLORS } from '@/types/payment-card'
import { formatCurrency } from '@/lib/currency'
import { ColorSwatches } from '@/components/ui/color-swatches'
import type { PaymentCard, PaymentCardFormData } from '@/types/payment-card'

interface CardManagerProps {
  currency: string
}

const EMPTY_CARD: PaymentCardFormData = {
  name: '',
  card_type: 'debit',
  last_four: '',
  color: CARD_COLORS[0],
  credit_limit: undefined,
}

export function CardManager({ currency }: CardManagerProps) {
  const { cards, isLoading, error, fetch, add, update, remove } = usePaymentCardStore(
    useShallow((state) => ({
      cards: state.cards,
      isLoading: state.isLoading,
      error: state.error,
      fetch: state.fetch,
      add: state.add,
      update: state.update,
      remove: state.remove,
    }))
  )
  const [formOpen, setFormOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<PaymentCard | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PaymentCard | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    void fetch().finally(() => setHasLoaded(true))
  }, [fetch])

  const form = useForm<PaymentCardFormData>({
    resolver: zodResolver(paymentCardFormSchema),
    defaultValues: EMPTY_CARD,
  })
  const { errors, isSubmitting } = form.formState

  const openAdd = () => {
    setEditingCard(null)
    form.reset(EMPTY_CARD)
    setFormOpen(true)
  }

  const handleEdit = (card: PaymentCard) => {
    setEditingCard(card)
    form.reset({
      name: card.name,
      card_type: card.card_type,
      last_four: card.last_four || '',
      color: card.color,
      credit_limit: card.credit_limit || undefined,
    })
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingCard(null)
    form.reset(EMPTY_CARD)
  }

  const handleSubmit = async (data: PaymentCardFormData) => {
    const creditLimit = data.card_type === 'credit' ? data.credit_limit : undefined
    try {
      if (editingCard) {
        // An edit clears empty optional fields with null: core rejects "" as last-four digits,
        // and an omitted limit would keep the stored one after a switch to debit.
        await update(editingCard.id, {
          ...data,
          last_four: data.last_four || null,
          credit_limit: creditLimit || null,
        })
        toast.success(`Saved ${data.name}`)
      } else {
        await add({ ...data, credit_limit: creditLimit })
        toast.success(`Added ${data.name}`)
      }
      closeForm()
    } catch (saveError) {
      toast.error(`Couldn't save ${data.name}`, {
        description: saveError instanceof Error ? saveError.message : 'Try again.',
      })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await remove(deleteTarget.id)
      toast.success(`Deleted ${deleteTarget.name}`)
    } catch (deleteError) {
      toast.error(`Couldn't delete ${deleteTarget.name}`, {
        description: deleteError instanceof Error ? deleteError.message : 'Nothing changed.',
      })
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  const cardType = form.watch('card_type')
  const selectedColor = form.watch('color')
  const loading = cards.length === 0 && !error && (isLoading || !hasLoaded)
  const isEmpty = !loading && !error && cards.length === 0 && !formOpen

  const cardForm = formOpen ? (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      noValidate
      aria-labelledby="card-form-title"
      className="border-border flex flex-col gap-5 border-b pb-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="card-form-title" className="text-foreground text-base font-bold">
          {editingCard ? `Edit ${editingCard.name}` : 'New payment card'}
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={closeForm} aria-label="Close card form">
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="card-name">Card name</Label>
          <Input
            id="card-name"
            placeholder="e.g. Everyday Visa"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'card-name-error' : undefined}
            {...form.register('name')}
          />
          <FieldError id="card-name-error">{errors.name?.message}</FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="card-type">Type</Label>
          <Select
            value={cardType}
            onValueChange={(value) => form.setValue('card_type', value as 'credit' | 'debit')}
          >
            <SelectTrigger id="card-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="last-four">
            Last 4 digits <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="last-four"
            placeholder="1234"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            aria-invalid={Boolean(errors.last_four)}
            aria-describedby={errors.last_four ? 'last-four-error' : undefined}
            {...form.register('last_four')}
          />
          <FieldError id="last-four-error">{errors.last_four?.message}</FieldError>
        </div>

        {cardType === 'credit' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="credit-limit">
              Monthly limit <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="credit-limit"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="5000"
              aria-invalid={Boolean(errors.credit_limit)}
              aria-describedby={errors.credit_limit ? 'credit-limit-error' : 'credit-limit-hint'}
              {...form.register('credit_limit', {
                setValueAs: (value: unknown) =>
                  value === '' || value === null || value === undefined ? undefined : Number(value),
              })}
            />
            {errors.credit_limit ? (
              <FieldError id="credit-limit-error">
                Enter a limit above zero, or leave it empty.
              </FieldError>
            ) : (
              <FieldHint id="credit-limit-hint">In {currency}.</FieldHint>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="text-sm leading-none font-medium">
          Color
        </span>
        <ColorSwatches
          label="Card color"
          colors={CARD_COLORS}
          value={selectedColor}
          onChange={(color) => form.setValue('color', color)}
          size="sm"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={closeForm}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {editingCard ? 'Save card' : 'Add card'}
        </Button>
      </div>
    </form>
  ) : null

  let list: React.ReactNode = null
  if (loading) {
    list = <SettingsListSkeleton label="Loading payment cards" rows={2} />
  } else if (error && cards.length === 0) {
    list = (
      <EmptyState
        icon={TriangleAlert}
        tone="danger"
        variant="plain"
        size="compact"
        headingLevel="h3"
        title="Couldn't load payment cards"
        description="Your cards are safe; they just didn't load."
        action={
          <Button variant="outline" size="sm" onClick={() => void fetch()}>
            <RotateCw aria-hidden="true" />
            Retry
          </Button>
        }
      />
    )
  } else if (isEmpty) {
    list = (
      <EmptyState
        icon={CreditCard}
        variant="plain"
        size="compact"
        headingLevel="h3"
        title="No payment cards"
        description="Add the cards you pay with, then pick one on each subscription."
        action={
          <Button variant="outline" size="sm" onClick={openAdd}>
            <Plus aria-hidden="true" />
            Add payment card
          </Button>
        }
      />
    )
  } else if (cards.length > 0) {
    list = (
      <ul className="divide-border flex flex-col divide-y">
        {cards.map((card) => (
          <li key={card.id} className="flex items-center gap-3 py-2.5">
            <span
              aria-hidden="true"
              className="border-border-hover flex size-9 shrink-0 items-center justify-center rounded-md border"
              style={{ backgroundColor: card.color }}
            >
              <CreditCard className="size-4 text-[color:var(--color-swatch-foreground)]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-medium">{card.name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {card.card_type === 'credit' ? 'Credit' : 'Debit'}
                {card.last_four ? ` ···· ${card.last_four}` : ''}
                {card.card_type === 'credit' && card.credit_limit
                  ? ` · Limit ${formatCurrency(card.credit_limit, currency)}`
                  : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleEdit(card)}
                aria-label={`Edit ${card.name}`}
              >
                <Pencil aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                onClick={() => setDeleteTarget(card)}
                aria-label={`Delete ${card.name}`}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <SettingsSection
        id="cards"
        title="Payment Cards"
        description="The cards your subscriptions are charged to."
        action={
          isEmpty || loading ? null : (
            <Button size="sm" onClick={openAdd} disabled={formOpen && !editingCard}>
              <Plus aria-hidden="true" />
              Add card
            </Button>
          )
        }
      >
        {cardForm}
        {list}
      </SettingsSection>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? 'card'}?`}
        description="Subscriptions charged to it keep everything else and lose only the card link. This can't be undone."
        confirmLabel="Delete card"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </>
  )
}

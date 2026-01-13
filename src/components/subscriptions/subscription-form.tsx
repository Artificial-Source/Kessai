import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { useCategories } from '@/hooks/use-categories'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { pickAndSaveLogo, getLogoDataUrl } from '@/lib/logo-storage'
import { CreditCard, Upload, X } from 'lucide-react'
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
import {
  subscriptionFormSchema,
  BILLING_CYCLE_LABELS,
  SUBSCRIPTION_COLORS,
  type SubscriptionFormData,
  type BillingCycle,
  type Subscription,
} from '@/types/subscription'
import { getCurrencyOptions } from '@/lib/currency'
import { cn } from '@/lib/utils'

type SubscriptionFormProps = {
  subscription?: Subscription | null
  onSubmit: (data: SubscriptionFormData) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export function SubscriptionForm({
  subscription,
  onSubmit,
  onCancel,
  isLoading = false,
}: SubscriptionFormProps) {
  const { categories } = useCategories()
  const { cards, fetch: fetchCards } = usePaymentCardStore()
  const isEditing = Boolean(subscription)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  useEffect(() => {
    if (subscription?.logo_url) {
      getLogoDataUrl(subscription.logo_url).then((url) => {
        if (url) setLogoPreview(url)
      })
    }
  }, [subscription?.logo_url])

  const form = useForm<SubscriptionFormData>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: {
      name: '',
      amount: 0,
      currency: 'USD',
      billing_cycle: 'monthly',
      billing_day: null,
      category_id: null,
      color: SUBSCRIPTION_COLORS[0],
      notes: null,
      next_payment_date: format(new Date(), 'yyyy-MM-dd'),
    },
  })

  useEffect(() => {
    if (subscription) {
      form.reset({
        name: subscription.name,
        amount: subscription.amount,
        currency: subscription.currency,
        billing_cycle: subscription.billing_cycle,
        billing_day: subscription.billing_day,
        category_id: subscription.category_id,
        color: subscription.color || SUBSCRIPTION_COLORS[0],
        notes: subscription.notes,
        next_payment_date: subscription.next_payment_date
          ? subscription.next_payment_date.split('T')[0]
          : format(new Date(), 'yyyy-MM-dd'),
      })
    }
  }, [subscription, form])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const isValid = await form.trigger()
    if (isValid) {
      await onSubmit(form.getValues())
    }
  }

  const selectedColor = form.watch('color')
  const currencyOptions = getCurrencyOptions()

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="Netflix, Spotify, etc."
            className="border-white/10 bg-white/5"
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="9.99"
              className="border-white/10 bg-white/5"
              {...form.register('amount', { valueAsNumber: true })}
            />
            {form.formState.errors.amount && (
              <p className="text-destructive text-sm">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={form.watch('currency')}
              onValueChange={(value) => form.setValue('currency', value)}
            >
              <SelectTrigger className="border-white/10 bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="billing_cycle">Billing Cycle *</Label>
            <Select
              value={form.watch('billing_cycle')}
              onValueChange={(value) => form.setValue('billing_cycle', value as BillingCycle)}
            >
              <SelectTrigger className="border-white/10 bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="next_payment_date">Next Payment *</Label>
            <Input
              id="next_payment_date"
              type="date"
              className="border-white/10 bg-white/5"
              {...form.register('next_payment_date')}
            />
            {form.formState.errors.next_payment_date && (
              <p className="text-destructive text-sm">
                {form.formState.errors.next_payment_date.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={form.watch('category_id') || 'none'}
            onValueChange={(value) => form.setValue('category_id', value === 'none' ? null : value)}
          >
            <SelectTrigger className="border-white/10 bg-white/5">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {SUBSCRIPTION_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => form.setValue('color', color)}
                className={cn(
                  'h-8 w-8 rounded-lg transition-all',
                  selectedColor === color
                    ? 'ring-offset-background scale-110 ring-2 ring-white ring-offset-2'
                    : 'hover:scale-105'
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            {logoPreview ? (
              <div className="relative">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-12 w-12 rounded-lg border border-white/10 object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setLogoPreview(null)
                    form.setValue('logo_url', null)
                  }}
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                <Upload className="text-muted-foreground h-5 w-5" />
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={isUploadingLogo}
              onClick={async () => {
                setIsUploadingLogo(true)
                try {
                  const subId = subscription?.id || `new-${Date.now()}`
                  const filename = await pickAndSaveLogo(subId)
                  if (filename) {
                    form.setValue('logo_url', filename)
                    const dataUrl = await getLogoDataUrl(filename)
                    if (dataUrl) setLogoPreview(dataUrl)
                  }
                } finally {
                  setIsUploadingLogo(false)
                }
              }}
            >
              {isUploadingLogo ? 'Uploading...' : logoPreview ? 'Change Logo' : 'Upload Logo'}
            </Button>
          </div>
        </div>

        {cards.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="card">Payment Card</Label>
            <Select
              value={form.watch('card_id') || 'none'}
              onValueChange={(value) => form.setValue('card_id', value === 'none' ? null : value)}
            >
              <SelectTrigger className="border-white/10 bg-white/5">
                <SelectValue placeholder="Select card" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No card</SelectItem>
                {cards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" style={{ color: card.color }} />
                      {card.name}
                      {card.last_four && (
                        <span className="text-muted-foreground">•••• {card.last_four}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            placeholder="Optional notes..."
            className="border-white/10 bg-white/5"
            {...form.register('notes')}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </span>
          ) : isEditing ? (
            'Update Subscription'
          ) : (
            'Add Subscription'
          )}
        </Button>
      </div>
    </form>
  )
}

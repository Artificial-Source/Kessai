import { useEffect, useState, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useCategories } from '@/hooks/use-categories'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { pickAndSaveLogo, getLogoDataUrl } from '@/lib/logo-storage'
import { CreditCard, Upload, X, Loader2 } from 'lucide-react'
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
  SUBSCRIPTION_COLORS,
  type SubscriptionFormData,
  type Subscription,
} from '@/types/subscription'
import { BILLING_CYCLE_LABELS } from '@/lib/constants'
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
  const { cards, fetch: fetchCards } = usePaymentCardStore(
    useShallow((state) => ({
      cards: state.cards,
      fetch: state.fetch,
    }))
  )
  const isEditing = Boolean(subscription)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isLoadingLogo, setIsLoadingLogo] = useState(Boolean(subscription?.logo_url))
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  // Only fetch cards if not already loaded
  useEffect(() => {
    if (cards.length === 0) {
      fetchCards()
    }
  }, [cards.length, fetchCards])

  // Load logo preview on mount if subscription has a logo
  useEffect(() => {
    let cancelled = false
    if (subscription?.logo_url) {
      setIsLoadingLogo(true)
      getLogoDataUrl(subscription.logo_url)
        .then((url) => {
          if (!cancelled && url) setLogoPreview(url)
        })
        .finally(() => {
          if (!cancelled) setIsLoadingLogo(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [subscription?.logo_url])

  // Compute initial form values from subscription (only runs once due to key prop)
  const initialValues = useMemo<SubscriptionFormData>(
    () => ({
      name: subscription?.name ?? '',
      amount: subscription?.amount ?? 0,
      currency: subscription?.currency ?? 'USD',
      billing_cycle: subscription?.billing_cycle ?? 'monthly',
      billing_day: subscription?.billing_day ?? null,
      category_id: subscription?.category_id ?? null,
      card_id: subscription?.card_id ?? null,
      color: subscription?.color ?? SUBSCRIPTION_COLORS[0],
      logo_url: subscription?.logo_url ?? null,
      notes: subscription?.notes ?? null,
      next_payment_date: subscription?.next_payment_date
        ? subscription.next_payment_date.split('T')[0]
        : dayjs().format('YYYY-MM-DD'),
    }),
    [subscription]
  )

  const form = useForm<SubscriptionFormData>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: initialValues,
  })

  // Only watch color since it's used for visual feedback
  const selectedColor = form.watch('color')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const isValid = await form.trigger()
    if (isValid) {
      await onSubmit(form.getValues())
    }
  }

  const currencyOptions = useMemo(() => getCurrencyOptions(), [])

  return (
    <form onSubmit={handleSubmit} className="transform-gpu space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="Netflix, Spotify, etc."
            className="border-border bg-muted/50"
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
              className="border-border bg-muted/50"
              {...form.register('amount', { valueAsNumber: true })}
            />
            {form.formState.errors.amount && (
              <p className="text-destructive text-sm">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Controller
              control={form.control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="border-border bg-muted/50">
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
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="billing_cycle">Billing Cycle *</Label>
            <Controller
              control={form.control}
              name="billing_cycle"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="border-border bg-muted/50">
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
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="next_payment_date">Next Payment *</Label>
            <Input
              id="next_payment_date"
              type="date"
              className="border-border bg-muted/50"
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
          <Controller
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <Select
                value={field.value ?? 'none'}
                onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
              >
                <SelectTrigger className="border-border bg-muted/50">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
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
                  'h-8 w-8 rounded-lg',
                  selectedColor === color &&
                    'ring-primary ring-offset-background ring-2 ring-offset-2'
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            {isLoadingLogo ? (
              <div className="border-border bg-muted/50 flex h-12 w-12 items-center justify-center rounded-lg border">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : logoPreview ? (
              <div className="relative">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="border-border h-12 w-12 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setLogoPreview(null)
                    form.setValue('logo_url', null)
                  }}
                  className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="border-border bg-muted/50 flex h-12 w-12 items-center justify-center rounded-lg border">
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
                    if (dataUrl) {
                      setLogoPreview(dataUrl)
                    } else {
                      toast.error('Failed to load logo preview')
                    }
                  }
                } catch (error) {
                  console.error('Logo upload failed:', error)
                  toast.error('Failed to upload logo', {
                    description: 'Please try again with a different image.',
                  })
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
            <Controller
              control={form.control}
              name="card_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                >
                  <SelectTrigger className="border-border bg-muted/50">
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
              )}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            placeholder="Optional notes..."
            className="border-border bg-muted/50"
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

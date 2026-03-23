import { useEffect, useState, useMemo, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useCategories } from '@/hooks/use-categories'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useLogoFetch } from '@/hooks/use-logo-fetch'
import { usePriceHistory } from '@/hooks/use-price-history'
import { pickAndSaveLogo, getLogoDataUrl } from '@/lib/logo-storage'
import { SUBSCRIPTION_TEMPLATES, getTemplateLogo } from '@/data/subscription-templates'
import { CreditCard, Upload, X, Loader2, Users, Check, Globe, ChevronDown } from 'lucide-react'
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
import { PriceHistoryTimeline } from '@/components/subscriptions/price-history-timeline'
import {
  subscriptionFormSchema,
  SUBSCRIPTION_COLORS,
  type SubscriptionFormData,
  type Subscription,
} from '@/types/subscription'
import { BILLING_CYCLE_LABELS } from '@/lib/constants'
import { getCurrencyOptions, formatCurrency, type CurrencyCode } from '@/lib/currency'
import { convertCurrencyCached } from '@/lib/exchange-rates'
import { cn } from '@/lib/utils'
import type { SubscriptionTemplate } from '@/data/subscription-templates'

type SubscriptionFormProps = {
  subscription?: Subscription | null
  template?: SubscriptionTemplate | null
  onSubmit: (data: SubscriptionFormData) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export function SubscriptionForm({
  subscription,
  template,
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
  const globalCurrency = (useSettingsStore((s) => s.settings)?.currency || 'USD') as CurrencyCode
  const isEditing = Boolean(subscription)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isLoadingLogo, setIsLoadingLogo] = useState(Boolean(subscription?.logo_url))
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  // Auto-fetch logo based on subscription name
  const { fetchedLogoPreview, isFetchingLogo, fetchedLogoFilename, fetchLogo, clearFetchedLogo } =
    useLogoFetch(500)
  const prevNameRef = useRef(subscription?.name ?? '')
  const [showPriceHistory, setShowPriceHistory] = useState(false)

  const { changes: priceHistory } = usePriceHistory(subscription?.id)

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

  // Compute initial form values from subscription or template (only runs once due to key prop)
  const initialValues = useMemo<SubscriptionFormData>(() => {
    if (subscription) {
      return {
        name: subscription.name,
        amount: subscription.amount,
        currency: subscription.currency,
        billing_cycle: subscription.billing_cycle,
        billing_day: subscription.billing_day ?? null,
        category_id: subscription.category_id ?? null,
        card_id: subscription.card_id ?? null,
        color: subscription.color ?? SUBSCRIPTION_COLORS[0],
        logo_url: subscription.logo_url ?? null,
        notes: subscription.notes ?? null,
        next_payment_date: subscription.next_payment_date
          ? subscription.next_payment_date.split('T')[0]
          : dayjs().format('YYYY-MM-DD'),
        is_trial: subscription.status === 'trial',
        trial_end_date: subscription.trial_end_date ?? null,
        shared_count: subscription.shared_count ?? 1,
      }
    }

    if (template) {
      // template.category may be a category ID (matched by dialog) or a name
      const categoryId = categories.find((c) => c.id === template.category)
        ? template.category
        : (categories.find((c) => c.name.toLowerCase() === template.category.toLowerCase())?.id ??
          null)

      return {
        name: template.name,
        amount: template.defaultAmount ?? 0,
        currency: template.currency,
        billing_cycle: template.defaultBillingCycle,
        billing_day: null,
        category_id: categoryId,
        card_id: null,
        color: template.color,
        logo_url: null,
        notes: null,
        next_payment_date: dayjs().format('YYYY-MM-DD'),
        is_trial: false,
        trial_end_date: null,
        shared_count: 1,
      }
    }

    return {
      name: '',
      amount: 0,
      currency: globalCurrency,
      billing_cycle: 'monthly',
      billing_day: null,
      category_id: null,
      card_id: null,
      color: SUBSCRIPTION_COLORS[0],
      logo_url: null,
      notes: null,
      next_payment_date: dayjs().format('YYYY-MM-DD'),
      is_trial: false,
      trial_end_date: null,
      shared_count: 1,
    }
  }, [subscription, template, categories, globalCurrency])

  const form = useForm<SubscriptionFormData>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: initialValues,
  })

  // Only watch color since it's used for visual feedback
  const selectedColor = form.watch('color')
  const isTrial = form.watch('is_trial')
  const sharedCount = form.watch('shared_count')
  const watchedAmount = form.watch('amount')
  const watchedCurrency = form.watch('currency') as CurrencyCode

  // Conversion hint: show approximate display-currency equivalent when currencies differ
  const conversionHint = useMemo(() => {
    if (!watchedAmount || watchedAmount <= 0) return null
    if (watchedCurrency === globalCurrency) return null
    const converted = convertCurrencyCached(watchedAmount, watchedCurrency, globalCurrency)
    if (converted === null) return null
    return formatCurrency(converted, globalCurrency)
  }, [watchedAmount, watchedCurrency, globalCurrency])

  // When a template with a domain is selected, immediately trigger a logo fetch
  const templateDomain = template?.domain ?? null
  useEffect(() => {
    if (template && templateDomain && !subscription) {
      fetchLogo(template.name, templateDomain)
    }
    // Only run on mount (template won't change due to key prop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watch the name field and auto-fetch logo when it changes (only for new subscriptions without a logo)
  useEffect(() => {
    const sub = form.watch((values) => {
      const currentName = values.name?.trim() ?? ''
      const currentLogoUrl = values.logo_url

      // Only auto-fetch if: no logo set, name changed, and name is long enough
      if (
        !currentLogoUrl &&
        !logoPreview &&
        currentName !== prevNameRef.current &&
        currentName.length >= 2
      ) {
        prevNameRef.current = currentName
        fetchLogo(currentName)
      }
    })
    return () => sub.unsubscribe()
  }, [form, fetchLogo, logoPreview])

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        {conversionHint && (
          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px]">
            ≈ {conversionHint} {globalCurrency}
          </p>
        )}

        {/* ── Billing ───────────────────────────────────────── */}
        <div className="border-border mt-4 border-t pt-4" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        {/* ── Advanced ──────────────────────────────────────── */}
        <div className="border-border mt-4 border-t pt-4" />

        {/* Free Trial Toggle */}
        <div className="border-border rounded-lg border bg-[var(--color-subtle-overlay)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="is_trial" className="cursor-pointer">
                Start as Free Trial
              </Label>
            </div>
            <Controller
              control={form.control}
              name="is_trial"
              render={({ field }) => (
                <button
                  type="button"
                  role="switch"
                  id="is_trial"
                  aria-checked={field.value}
                  onClick={() => field.onChange(!field.value)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                    field.value ? 'bg-blue-500' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                      field.value ? 'translate-x-4.5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              )}
            />
          </div>
          {isTrial && (
            <div className="mt-3 space-y-2">
              <Label htmlFor="trial_end_date">Trial End Date</Label>
              <Input
                id="trial_end_date"
                type="date"
                className="border-border bg-muted/50"
                {...form.register('trial_end_date')}
              />
            </div>
          )}
        </div>

        {/* Shared Subscription */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="text-muted-foreground h-4 w-4" />
            <Label htmlFor="shared_count">Shared Among</Label>
          </div>
          <div className="flex items-center gap-3">
            <Input
              id="shared_count"
              type="number"
              min="1"
              max="99"
              className="border-border bg-muted/50 w-20"
              {...form.register('shared_count', { valueAsNumber: true })}
            />
            <span className="text-muted-foreground text-sm">
              {sharedCount > 1 ? `Your share: 1/${sharedCount}` : 'Just me'}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {SUBSCRIPTION_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => form.setValue('color', color)}
                aria-label={`Color ${color}`}
                aria-pressed={selectedColor === color}
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
                    clearFetchedLogo()
                  }}
                  className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="border-border bg-muted/50 flex h-12 w-12 items-center justify-center rounded-lg border">
                {isFetchingLogo ? (
                  <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="text-muted-foreground h-5 w-5" />
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
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
                      clearFetchedLogo()
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
                <Upload className="h-3.5 w-3.5" />
                {isUploadingLogo
                  ? 'Uploading...'
                  : logoPreview
                    ? 'Change Logo'
                    : 'Upload Custom Logo'}
              </Button>
            </div>
          </div>
          {/* Logo library picker */}
          <LogoLibraryPicker
            onSelect={(domain) => {
              // Use the bundled local logo — no network fetch needed
              const logoPath = getTemplateLogo(domain)
              if (logoPath) {
                form.setValue('logo_url', logoPath, { shouldDirty: true })
                setLogoPreview(logoPath)
                clearFetchedLogo()
              }
            }}
          />
          {/* Auto-fetched logo suggestion */}
          {!logoPreview && fetchedLogoPreview && !isFetchingLogo && (
            <div className="border-border bg-muted/30 flex items-center gap-3 rounded-lg border p-3">
              <img
                src={fetchedLogoPreview}
                alt="Suggested logo"
                className="border-border h-10 w-10 rounded-lg border object-cover"
              />
              <div className="flex flex-1 flex-col">
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Globe className="h-3 w-3" />
                  Logo found automatically
                </span>
              </div>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    if (fetchedLogoFilename) {
                      form.setValue('logo_url', fetchedLogoFilename)
                      setLogoPreview(fetchedLogoPreview)
                      clearFetchedLogo()
                    }
                  }}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Use
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => clearFetchedLogo()}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
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

        {/* Price History (edit mode only) */}
        {isEditing && priceHistory.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowPriceHistory(!showPriceHistory)}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {showPriceHistory ? 'Hide' : 'Show'} price history ({priceHistory.length} change
              {priceHistory.length !== 1 ? 's' : ''})
            </button>
            {showPriceHistory && (
              <div className="border-border rounded-lg border bg-[var(--color-subtle-overlay)] p-4">
                <PriceHistoryTimeline
                  changes={priceHistory}
                  currency={(subscription?.currency || 'USD') as CurrencyCode}
                />
              </div>
            )}
          </div>
        )}
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

// ── Logo Library Picker ─────────────────────────────────────────────
const LOGO_LIBRARY = SUBSCRIPTION_TEMPLATES.filter((t) => t.domain).map((t) => ({
  name: t.name,
  domain: t.domain!,
  color: t.color,
}))

function LogoLibraryPicker({ onSelect }: { onSelect: (domain: string, name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return LOGO_LIBRARY.slice(0, 24)
    const q = search.toLowerCase()
    return LOGO_LIBRARY.filter(
      (l) => l.name.toLowerCase().includes(q) || l.domain.toLowerCase().includes(q)
    ).slice(0, 24)
  }, [search])

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase transition-colors"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
        Pick from library
      </button>
      {open && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search logos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border bg-input text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary h-8 w-full rounded-lg border px-3 font-[family-name:var(--font-sans)] text-xs focus:ring-1 focus:outline-none"
          />
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {filtered.map((logo) => (
              <button
                key={logo.domain}
                type="button"
                title={logo.name}
                onClick={() => {
                  onSelect(logo.domain, logo.name)
                  setOpen(false)
                  setSearch('')
                }}
                className="border-border hover:border-primary/50 hover:bg-primary/5 group flex h-10 w-10 items-center justify-center rounded-lg border transition-colors"
              >
                <LogoLibraryIcon domain={logo.domain} name={logo.name} color={logo.color} />
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-muted-foreground py-2 text-center text-xs">No logos found</p>
          )}
        </div>
      )}
    </div>
  )
}

function LogoLibraryIcon({ domain, name, color }: { domain: string; name: string; color: string }) {
  const [error, setError] = useState(false)
  const logoPath = getTemplateLogo(domain)

  if (!logoPath || error) {
    return (
      <div
        className="flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={logoPath}
      alt={name}
      className="h-7 w-7 rounded object-cover"
      onError={() => setError(true)}
    />
  )
}

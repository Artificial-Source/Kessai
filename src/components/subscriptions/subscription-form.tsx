import { useEffect, useState, useMemo, useRef, useCallback, useId } from 'react'
import { useForm, Controller, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useCategories } from '@/hooks/use-categories'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useLogoFetch } from '@/hooks/use-logo-fetch'
import { pickAndSaveLogo, getLogoDataUrl } from '@/lib/logo-storage'
import { SUBSCRIPTION_TEMPLATES, getTemplateLogo } from '@/data/subscription-templates'
import {
  AlertTriangle,
  CreditCard,
  ImageIcon,
  Upload,
  X,
  Loader2,
  Check,
  Globe,
  ChevronDown,
  RotateCw,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ColorSwatches } from '@/components/ui/color-swatches'
import { DialogFooter } from '@/components/ui/dialog'
import { FieldError, FieldHint } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { readableInkOn } from '@/lib/color'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CurrencySelect } from '@/components/ui/currency-select'
import {
  subscriptionFormSchema,
  SUBSCRIPTION_COLORS,
  type SubscriptionFormData,
  type Subscription,
} from '@/types/subscription'
import { BILLING_CYCLE_LABELS } from '@/lib/constants'
import type { CurrencyCode } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { TagPicker } from '@/components/tags/tag-picker'
import { useTagStore } from '@/stores/tag-store'
import type { SubscriptionTemplate } from '@/data/subscription-templates'

/** Recovery state once the subscription is saved but its tag links are not. */
type TagRetryState = {
  subscriptionName: string
  isRetrying: boolean
  onRetry: () => void
}

type SubscriptionFormProps = {
  subscription?: Subscription | null
  template?: SubscriptionTemplate | null
  onSubmit: (data: SubscriptionFormData, tagIds?: string[]) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  /** Locks the saved draft and swaps submit for a tags-only retry. */
  tagRetry?: TagRetryState | null
}

/** Validated fields in visual order, so a failed submit focuses the first one on screen. */
const VALIDATED_FIELDS: FieldPath<SubscriptionFormData>[] = [
  'name',
  'amount',
  'next_payment_date',
  'shared_count',
  'trial_end_date',
  'notes',
]

const NOTES_MAX = 500

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
}

export function SubscriptionForm({
  subscription,
  template,
  onSubmit,
  onCancel,
  isLoading = false,
  tagRetry = null,
}: SubscriptionFormProps) {
  const { categories } = useCategories()
  const { cards, fetch: fetchCards } = usePaymentCardStore(
    useShallow((state) => ({
      cards: state.cards,
      fetch: state.fetch,
    }))
  )
  const globalCurrency = (useSettingsStore((s) => s.settings?.currency) || 'USD') as CurrencyCode
  const isEditing = Boolean(subscription)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const fetchForSubscription = useTagStore((s) => s.fetchForSubscription)
  const [isLoadingTags, setIsLoadingTags] = useState(Boolean(subscription?.id))
  const [tagLoadError, setTagLoadError] = useState<string | null>(null)
  const [tagLoadAttempt, setTagLoadAttempt] = useState(0)
  // Appearance and notes are optional; new subscriptions start with them folded away.
  const [showAppearance, setShowAppearance] = useState(isEditing)
  const hasTagRetry = Boolean(tagRetry)
  const isRetryingTags = tagRetry?.isRetrying ?? false
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const tagRetryAlertId = useId()
  const fieldId = useId()
  const ids = {
    nameError: `${fieldId}-name-error`,
    amountHint: `${fieldId}-amount-hint`,
    amountError: `${fieldId}-amount-error`,
    dateError: `${fieldId}-date-error`,
    trialHint: `${fieldId}-trial-hint`,
    trialEndError: `${fieldId}-trial-end-error`,
    sharedHint: `${fieldId}-shared-hint`,
    sharedError: `${fieldId}-shared-error`,
    pinHint: `${fieldId}-pin-hint`,
    notesHint: `${fieldId}-notes-hint`,
    notesError: `${fieldId}-notes-error`,
    appearance: `${fieldId}-appearance`,
    logoLabel: `${fieldId}-logo-label`,
  }

  // Hand focus to the recovery action when it appears and after each failed attempt.
  useEffect(() => {
    if (hasTagRetry && !isRetryingTags) retryButtonRef.current?.focus()
  }, [hasTagRetry, isRetryingTags])

  // A failed lookup must not turn an existing subscription's desired tags into an empty list.
  useEffect(() => {
    let cancelled = false
    if (!subscription?.id) {
      setSelectedTagIds([])
      setIsLoadingTags(false)
      setTagLoadError(null)
      return
    }
    setIsLoadingTags(true)
    setTagLoadError(null)
    void fetchForSubscription(subscription.id)
      .then((tags) => {
        if (!cancelled) setSelectedTagIds(tags.map((tag) => tag.id))
      })
      .catch((error: unknown) => {
        if (!cancelled) setTagLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTags(false)
      })
    return () => {
      cancelled = true
    }
  }, [subscription?.id, fetchForSubscription, tagLoadAttempt])

  // Bundled library logos (/logos/templates/…) ship with the app and render as-is; only
  // uploaded or fetched logos live in the logo store and need to be read back. A template
  // starts with its bundled logo, so a subscription made from it keeps that logo offline.
  const initialLogoUrl = subscription
    ? (subscription.logo_url ?? null)
    : getTemplateLogo(template?.domain ?? null)
  const initialLogoIsBundled = initialLogoUrl?.startsWith('/logos/') ?? false
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initialLogoIsBundled ? initialLogoUrl : null
  )
  const [isLoadingLogo, setIsLoadingLogo] = useState(
    Boolean(initialLogoUrl) && !initialLogoIsBundled
  )
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  // Auto-fetch logo based on subscription name
  const { fetchedLogoPreview, isFetchingLogo, fetchedLogoFilename, fetchLogo, clearFetchedLogo } =
    useLogoFetch(500)
  const prevNameRef = useRef(subscription?.name ?? '')

  // Only fetch cards if not already loaded
  useEffect(() => {
    if (cards.length === 0) {
      fetchCards()
    }
  }, [cards.length, fetchCards])

  // Load the stored logo's preview on mount; bundled library logos are already set above.
  useEffect(() => {
    let cancelled = false
    const logoUrl = subscription?.logo_url
    if (logoUrl && !logoUrl.startsWith('/logos/')) {
      setIsLoadingLogo(true)
      getLogoDataUrl(logoUrl)
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
        is_pinned: subscription.is_pinned ?? false,
      }
    }

    // A new subscription starts without an amount: 0 is a valid (free) amount, so the
    // field must be filled on purpose rather than saved as free by accident.
    if (template) {
      // template.category may be a category ID (matched by dialog) or a name
      const categoryId = categories.find((c) => c.id === template.category)
        ? template.category
        : (categories.find((c) => c.name.toLowerCase() === template.category.toLowerCase())?.id ??
          null)

      return {
        name: template.name,
        amount: template.defaultAmount ?? Number.NaN,
        currency: template.currency,
        billing_cycle: template.defaultBillingCycle,
        billing_day: null,
        category_id: categoryId,
        card_id: null,
        color: template.color,
        logo_url: getTemplateLogo(template.domain),
        notes: null,
        next_payment_date: dayjs().format('YYYY-MM-DD'),
        is_trial: false,
        trial_end_date: null,
        shared_count: 1,
        is_pinned: false,
      }
    }

    return {
      name: '',
      amount: Number.NaN,
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
      is_pinned: false,
    }
  }, [subscription, template, categories, globalCurrency])

  const form = useForm<SubscriptionFormData>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: initialValues,
  })
  const { errors } = form.formState

  const selectedColor = form.watch('color')
  const isTrial = form.watch('is_trial')
  const sharedCount = form.watch('shared_count')
  const notesLength = form.watch('notes')?.length ?? 0

  // Zod's type errors ("expected number, received NaN") are not user copy.
  const amountError = errors.amount
    ? errors.amount.type === 'invalid_type'
      ? 'Enter an amount (0 if it’s free)'
      : errors.amount.message
    : undefined
  const sharedError = errors.shared_count ? 'Enter a number from 1 to 99' : undefined
  const notesError = errors.notes ? `Notes can be up to ${NOTES_MAX} characters` : undefined

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      // The subscription is already saved; only the tags retry may run now.
      if (hasTagRetry || isLoadingTags || tagLoadError) return
      const isValid = await form.trigger()
      if (isValid) {
        await onSubmit(form.getValues(), selectedTagIds)
        return
      }
      const firstInvalid = VALIDATED_FIELDS.find((field) => form.getFieldState(field).invalid)
      if (!firstInvalid) return
      if (firstInvalid === 'notes') setShowAppearance(true)
      // Let a folded section render before moving focus into it.
      requestAnimationFrame(() => form.setFocus(firstInvalid))
    },
    [form, onSubmit, selectedTagIds, hasTagRetry, isLoadingTags, tagLoadError]
  )

  const handleUploadLogo = async () => {
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
  }

  const describedBy = (...idsList: (string | false | undefined)[]) =>
    idsList.filter(Boolean).join(' ') || undefined

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
        {/* Once saved, the draft stays visible but read-only; only the tags retry still writes. */}
        <fieldset
          disabled={hasTagRetry}
          className={cn(
            'flex min-w-0 flex-col gap-6',
            hasTagRetry && 'pointer-events-none [&_:disabled]:opacity-50'
          )}
        >
          {/* ── Billing ── */}
          <fieldset className="flex min-w-0 flex-col gap-4">
            <legend className="type-label text-muted-foreground mb-4">Billing</legend>

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="Netflix, Spotify, etc."
                autoComplete="off"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={describedBy(errors.name && ids.nameError)}
                {...form.register('name')}
              />
              <FieldError id={ids.nameError}>{errors.name?.message}</FieldError>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="9.99"
                  aria-invalid={Boolean(amountError)}
                  aria-describedby={describedBy(ids.amountHint, amountError && ids.amountError)}
                  {...form.register('amount', { valueAsNumber: true })}
                />
                <FieldHint id={ids.amountHint}>The full charge. Use 0 for a free plan.</FieldHint>
                <FieldError id={ids.amountError}>{amountError}</FieldError>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Controller
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <CurrencySelect
                      id="currency"
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="billing_cycle">Billing cycle *</Label>
                <Controller
                  control={form.control}
                  name="billing_cycle"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="billing_cycle">
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="next_payment_date">Next payment *</Label>
                <Input
                  id="next_payment_date"
                  type="date"
                  aria-invalid={Boolean(errors.next_payment_date)}
                  aria-describedby={describedBy(errors.next_payment_date && ids.dateError)}
                  {...form.register('next_payment_date')}
                />
                <FieldError id={ids.dateError}>{errors.next_payment_date?.message}</FieldError>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="shared_count">Shared among</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="shared_count"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="99"
                  className="w-24"
                  aria-invalid={Boolean(sharedError)}
                  aria-describedby={describedBy(ids.sharedHint, sharedError && ids.sharedError)}
                  {...form.register('shared_count', { valueAsNumber: true })}
                />
                <FieldHint id={ids.sharedHint} className="text-sm">
                  {sharedCount > 1
                    ? `Totals count your share: 1/${sharedCount}`
                    : 'Just you; totals count the full amount'}
                </FieldHint>
              </div>
              <FieldError id={ids.sharedError}>{sharedError}</FieldError>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor="is_trial">Free trial</Label>
                  <FieldHint id={ids.trialHint}>Turn off once the trial becomes paid.</FieldHint>
                </div>
                <Controller
                  control={form.control}
                  name="is_trial"
                  render={({ field }) => (
                    <Switch
                      id="is_trial"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-describedby={ids.trialHint}
                    />
                  )}
                />
              </div>
              {isTrial && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="trial_end_date">Trial ends *</Label>
                  <Input
                    id="trial_end_date"
                    type="date"
                    aria-invalid={Boolean(errors.trial_end_date)}
                    aria-describedby={describedBy(errors.trial_end_date && ids.trialEndError)}
                    {...form.register('trial_end_date')}
                  />
                  <FieldError id={ids.trialEndError}>{errors.trial_end_date?.message}</FieldError>
                </div>
              )}
            </div>
          </fieldset>

          {/* ── Organize ── */}
          <div className="border-border border-t pt-6">
            <fieldset className="flex min-w-0 flex-col gap-4">
              <legend className="type-label text-muted-foreground mb-4">Organize</legend>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Controller
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? 'none'}
                        onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                      >
                        <SelectTrigger id="category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No category</SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <span className="flex items-center gap-2">
                                <span
                                  aria-hidden="true"
                                  className="size-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: cat.color }}
                                />
                                {cat.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {cards.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="card">Payment card</Label>
                    <Controller
                      control={form.control}
                      name="card_id"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? 'none'}
                          onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                        >
                          <SelectTrigger id="card">
                            <SelectValue placeholder="Select card" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No card</SelectItem>
                            {cards.map((card) => (
                              <SelectItem key={card.id} value={card.id}>
                                <span className="flex items-center gap-2">
                                  <CreditCard
                                    className="size-4 shrink-0"
                                    style={{ color: card.color }}
                                    aria-hidden="true"
                                  />
                                  {card.name}
                                  {card.last_four && (
                                    <span className="text-muted-foreground">
                                      •••• {card.last_four}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
              </div>

              {tagLoadError ? (
                <div
                  role="alert"
                  className="border-destructive/30 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-3"
                >
                  <p className="text-sm">Could not load subscription tags: {tagLoadError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTagLoadAttempt((attempt) => attempt + 1)}
                  >
                    <RotateCw aria-hidden="true" />
                    Retry loading tags
                  </Button>
                </div>
              ) : isLoadingTags ? (
                <p role="status" className="text-muted-foreground text-sm">
                  Loading subscription tags…
                </p>
              ) : (
                <TagPicker selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />
              )}

              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor="is_pinned">Pin to top</Label>
                  <FieldHint id={ids.pinHint}>Pinned subscriptions lead every list.</FieldHint>
                </div>
                <Controller
                  control={form.control}
                  name="is_pinned"
                  render={({ field }) => (
                    <Switch
                      id="is_pinned"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-describedby={ids.pinHint}
                    />
                  )}
                />
              </div>
            </fieldset>
          </div>

          {/* ── Appearance & notes (optional, folded on create) ── */}
          <div className="border-border flex min-w-0 flex-col gap-4 border-t pt-4">
            <button
              type="button"
              aria-expanded={showAppearance}
              aria-controls={ids.appearance}
              onClick={() => setShowAppearance((open) => !open)}
              className="hover:bg-accent-muted -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-left transition-colors duration-150"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="type-label text-muted-foreground">Appearance &amp; notes</span>
                <span className="text-muted-foreground text-xs">Color, logo, and notes</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'text-muted-foreground size-4 shrink-0 transition-transform duration-150',
                  showAppearance && 'rotate-180'
                )}
              />
            </button>

            <div id={ids.appearance} hidden={!showAppearance} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-sm leading-none font-medium" id={`${fieldId}-color`}>
                  Color
                </span>
                <ColorSwatches
                  label="Color"
                  colors={SUBSCRIPTION_COLORS}
                  value={selectedColor}
                  onChange={(color) => form.setValue('color', color, { shouldDirty: true })}
                />
              </div>

              <div role="group" aria-labelledby={ids.logoLabel} className="flex flex-col gap-3">
                <span id={ids.logoLabel} className="text-sm leading-none font-medium">
                  Logo
                </span>
                <div className="flex items-center gap-3">
                  <LogoPreview
                    src={logoPreview}
                    isBusy={isLoadingLogo || (!logoPreview && isFetchingLogo)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUploadingLogo}
                      aria-busy={isUploadingLogo || undefined}
                      onClick={handleUploadLogo}
                    >
                      {isUploadingLogo ? <Spinner /> : <Upload aria-hidden="true" />}
                      {logoPreview ? 'Change image' : 'Upload image'}
                    </Button>
                    {logoPreview && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setLogoPreview(null)
                          form.setValue('logo_url', null)
                          clearFetchedLogo()
                        }}
                      >
                        <X aria-hidden="true" />
                        Remove logo
                      </Button>
                    )}
                  </div>
                </div>

                {/* Auto-fetched logo suggestion */}
                {!logoPreview && fetchedLogoPreview && !isFetchingLogo && (
                  <div className="border-border flex items-center gap-3 rounded-lg border p-3">
                    <img
                      src={fetchedLogoPreview}
                      alt=""
                      className="border-border-hover size-10 rounded-md border object-cover"
                    />
                    <p className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                      <Globe className="size-4 shrink-0" aria-hidden="true" />
                      Logo found for this name
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (fetchedLogoFilename) {
                          form.setValue('logo_url', fetchedLogoFilename)
                          setLogoPreview(fetchedLogoPreview)
                          clearFetchedLogo()
                        }
                      }}
                    >
                      <Check aria-hidden="true" />
                      Use it
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Dismiss suggested logo"
                      onClick={() => clearFetchedLogo()}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                )}

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
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  maxLength={NOTES_MAX}
                  placeholder="Plan details, who uses it, how to cancel…"
                  aria-invalid={Boolean(notesError)}
                  aria-describedby={describedBy(ids.notesHint, notesError && ids.notesError)}
                  {...form.register('notes')}
                />
                <FieldHint id={ids.notesHint}>
                  {notesLength > 0
                    ? `${notesLength} of ${NOTES_MAX} characters`
                    : `Up to ${NOTES_MAX} characters`}
                </FieldHint>
                <FieldError id={ids.notesError}>{notesError}</FieldError>
              </div>
            </div>
          </div>
        </fieldset>
      </div>

      <div className="border-border -mx-6 flex flex-col gap-3 border-t px-6 pt-4">
        {tagRetry ? (
          <div
            role="alert"
            id={tagRetryAlertId}
            className="border-warning/30 bg-warning/5 flex items-start gap-3 rounded-lg border p-3"
          >
            <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p className="text-foreground text-sm font-medium">Subscription saved; tags failed</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {tagRetry.subscriptionName} is saved, but its tags were not applied. Retry tags to
                finish, or close and edit them later.
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="pt-0">
          <Button variant="outline" onClick={onCancel}>
            {tagRetry ? 'Close' : 'Cancel'}
          </Button>
          {tagRetry ? (
            <Button
              ref={retryButtonRef}
              onClick={tagRetry.onRetry}
              disabled={tagRetry.isRetrying}
              aria-busy={tagRetry.isRetrying || undefined}
              aria-describedby={tagRetryAlertId}
            >
              {tagRetry.isRetrying ? <Spinner /> : <RotateCw aria-hidden="true" />}
              Retry tags
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isLoading || isLoadingTags || Boolean(tagLoadError)}
              aria-busy={isLoading || undefined}
            >
              {isLoading ? <Spinner /> : null}
              {isEditing ? 'Update Subscription' : 'Add Subscription'}
            </Button>
          )}
        </DialogFooter>
      </div>
    </form>
  )
}

function LogoPreview({ src, isBusy }: { src: string | null; isBusy: boolean }) {
  if (src && !isBusy) {
    return (
      <img
        src={src}
        alt="Logo preview"
        className="border-border-hover size-12 shrink-0 rounded-lg border object-cover"
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className="border-border bg-input text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed"
    >
      {isBusy ? <Loader2 className="size-5 animate-spin" /> : <ImageIcon className="size-5" />}
    </div>
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
  const panelId = useId()

  const filtered = useMemo(() => {
    if (!search) return LOGO_LIBRARY.slice(0, 24)
    const q = search.toLowerCase()
    return LOGO_LIBRARY.filter(
      (l) => l.name.toLowerCase().includes(q) || l.domain.toLowerCase().includes(q)
    ).slice(0, 24)
  }, [search])

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground -ml-3 self-start"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn('transition-transform duration-150', open && 'rotate-180')}
        />
        Pick from library
      </Button>
      {open && (
        <div id={panelId} className="flex flex-col gap-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              placeholder="Search logos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search logo library"
              className="pl-10"
            />
          </div>
          {filtered.length > 0 ? (
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {filtered.map((logo) => (
                <button
                  key={logo.domain}
                  type="button"
                  title={logo.name}
                  aria-label={`Use ${logo.name} logo`}
                  onClick={() => {
                    onSelect(logo.domain, logo.name)
                    setOpen(false)
                    setSearch('')
                  }}
                  className="border-border hover:border-border-hover hover:bg-accent-muted flex aspect-square items-center justify-center rounded-md border transition-colors duration-150"
                >
                  <LogoLibraryIcon domain={logo.domain} name={logo.name} color={logo.color} />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No logos match &ldquo;{search}&rdquo;. Upload an image instead.
            </p>
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
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-sm text-xs font-bold"
        style={{ backgroundColor: color, color: readableInkOn(color) }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={logoPath}
      alt=""
      className="size-7 rounded-sm object-cover"
      onError={() => setError(true)}
    />
  )
}

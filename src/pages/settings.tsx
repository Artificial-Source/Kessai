import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSettings } from '@/hooks/use-settings'
import { useTheme } from '@/components/theme-provider'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUpdateStore } from '@/stores/update-store'
import { getCurrencyOptions } from '@/lib/currency'
import { Moon, Sun, Monitor, Zap, X, Check, Download } from 'lucide-react'
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
import { CategoryManager } from '@/components/categories/category-manager'
import { TagManager } from '@/components/tags/tag-manager'
import { DataManagement } from '@/components/settings/data-management'
import { CardManager } from '@/components/settings/card-manager'
import { DisplayExchangeRatesSettings } from '@/components/settings/display-exchange-rates-settings'
import { NotificationSettings } from '@/components/settings/notification-settings'
import { MotionSettings } from '@/components/settings/motion-settings'
import { SettingsSkeleton } from '@/components/settings/settings-skeleton'
import { UpdateSettings } from '@/components/settings/update-settings'
import { WebBackendBanner } from '@/components/ui/web-backend-banner'
import type { Theme } from '@/types/settings'
import type { CurrencyCode } from '@/lib/currency'
import { logger } from '@/lib/logger'

export function SettingsPage() {
  const {
    settings,
    isLoading,
    error,
    setNotifications,
    setNotificationDaysBefore,
    setNotificationTime,
    update,
    refresh: refetchSettings,
  } = useSettings()
  const { theme, setTheme } = useTheme()
  const { fetch: refetchSubscriptions } = useSubscriptionStore()
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const { fetch: refetchCategories } = useCategoryStore()
  const setBudget = useSettingsStore((state) => state.setBudget)
  const currentVersion = useUpdateStore((state) => state.currentVersion)
  const [budgetInput, setBudgetInput] = useState(settings?.monthly_budget?.toString() ?? '')
  const [budgetSaved, setBudgetSaved] = useState(false)
  const isInitialized = useRef(false)

  const handleDataChanged = () => {
    refetchSettings()
    refetchSubscriptions()
    refetchCategories()
  }

  // Sync budgetInput when settings load for the first time
  useEffect(() => {
    if (!isInitialized.current && settings) {
      setBudgetInput(settings.monthly_budget?.toString() ?? '')
      isInitialized.current = true
    }
  }, [settings])

  // Debounced auto-save for budget
  useEffect(() => {
    const currentBudgetStr = settings?.monthly_budget?.toString() ?? ''
    if (budgetInput === currentBudgetStr) return

    const timer = setTimeout(async () => {
      const val = parseFloat(budgetInput)
      if (!isNaN(val) && val > 0) {
        try {
          await setBudget(val)
          setBudgetSaved(true)
          setTimeout(() => setBudgetSaved(false), 2000)
        } catch {
          toast.error('Failed to save budget')
        }
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [budgetInput, settings?.monthly_budget, setBudget])

  if (isLoading || !settings) {
    return <SettingsSkeleton />
  }

  const themeOptions: { value: Theme; label: string; icon: React.ElementType }[] = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  const currencyOptions = getCurrencyOptions()
  const usedCurrencies = Array.from(
    new Set(
      subscriptions
        .map((subscription) => subscription.currency as CurrencyCode)
        .filter(Boolean)
        .concat(settings.currency as CurrencyCode)
    )
  )

  const handleDisplayCurrencyChange = async (value: string) => {
    try {
      await update({
        currency: value,
        display_exchange_rates: Object.fromEntries(
          Object.entries(settings.display_exchange_rates).filter(
            ([currencyCode]) => currencyCode !== value
          )
        ),
      })
      toast.success('Display currency updated')
    } catch {
      toast.error('Failed to update display currency')
    }
  }

  const handleSaveDisplayExchangeRates = async (display_exchange_rates: Record<string, number>) => {
    try {
      await update({ display_exchange_rates })
      toast.success('Exchange rates saved')
    } catch {
      toast.error('Failed to save exchange rates')
      throw new Error('Failed to save exchange rates')
    }
  }

  return (
    <div className="animate-fade-in-up flex flex-col space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">Customize your Kessai experience</p>
      </header>

      <WebBackendBanner error={error} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="glass-card flex flex-col gap-5 p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-foreground text-lg font-bold">Appearance</h2>
                <p className="text-muted-foreground text-sm">Customize how Kessai looks</p>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
                  Theme
                </span>
                <div className="flex gap-2">
                  {themeOptions.map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      variant={theme === value ? 'default' : 'outline'}
                      className="flex-1 gap-2"
                      onClick={() => setTheme(value)}
                      aria-pressed={theme === value}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="border-border flex flex-col gap-3 border-t pt-4">
                <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
                  Display Currency
                </span>
                <Select
                  value={settings.currency}
                  onValueChange={(value) => void handleDisplayCurrencyChange(value)}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DisplayExchangeRatesSettings
                mainCurrency={settings.currency as CurrencyCode}
                rates={settings.display_exchange_rates}
                usedCurrencies={usedCurrencies}
                currencyOptions={currencyOptions}
                onSave={handleSaveDisplayExchangeRates}
              />

              <div className="border-border flex flex-col gap-3 border-t pt-4">
                <Label htmlFor="monthly_budget">Monthly Budget</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-44">
                    <Input
                      id="monthly_budget"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={
                        settings.monthly_budget ? String(settings.monthly_budget) : 'e.g. 100.00'
                      }
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      className="border-border bg-muted/50 pr-7"
                    />
                    {(settings.monthly_budget !== null && settings.monthly_budget !== undefined) ||
                    budgetInput !== '' ? (
                      <button
                        type="button"
                        aria-label="Clear budget"
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
                        onClick={async () => {
                          try {
                            await setBudget(null)
                            setBudgetInput('')
                            setBudgetSaved(false)
                          } catch {
                            toast.error('Failed to clear budget')
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <span
                    className={`text-primary flex items-center gap-1 text-xs transition-opacity duration-300 ${budgetSaved ? 'opacity-100' : 'opacity-0'}`}
                    aria-live="polite"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Saved
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Zap className="text-primary h-5 w-5" />
                  <h2 className="text-foreground text-lg font-bold">Motion & Animations</h2>
                </div>
                <p className="text-muted-foreground text-sm">
                  Control animations, transitions, and hover effects
                </p>
              </div>

              <MotionSettings settings={settings} />
            </div>
          </div>
        </div>

        <div className="glass-card flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-foreground font-[family-name:var(--font-heading)] text-lg font-bold">
              Notifications
            </h2>
            <p className="text-muted-foreground text-sm">Get reminded before subscriptions renew</p>
          </div>

          <NotificationSettings
            settings={settings}
            onToggle={(enabled) => setNotifications(enabled)}
            onDaysBeforeChange={setNotificationDaysBefore}
            onTimeChange={setNotificationTime}
          />
        </div>

        <div className="grid auto-rows-fr gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="glass-card flex h-full flex-col gap-5 p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-foreground text-lg font-bold">Data & Backup</h2>
              <p className="text-muted-foreground text-sm">Export, import, and troubleshoot</p>
            </div>

            <DataManagement onDataChanged={handleDataChanged} />

            <div className="border-border border-t pt-4">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
                  Diagnostic Logs
                </span>
                <p className="text-muted-foreground text-sm">
                  Download app logs for troubleshooting
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-3 gap-2"
                onClick={() => logger.downloadLogs()}
              >
                <Download className="h-4 w-4" />
                Download Logs
              </Button>
            </div>
          </div>

          <div className="glass-card flex h-full flex-col gap-5 p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-foreground text-lg font-bold">Payment Cards</h2>
              <p className="text-muted-foreground text-sm">Manage your payment methods</p>
            </div>

            <CardManager currency={settings.currency as CurrencyCode} />
          </div>
        </div>

        <div className="grid auto-rows-fr gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="glass-card flex h-full flex-col gap-5 p-5">
            <UpdateSettings />
          </div>

          <div className="glass-card flex h-full flex-col gap-5 p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-foreground text-lg font-bold">About</h2>
              <p className="text-muted-foreground text-sm">Application information</p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-[family-name:var(--font-sans)] text-sm">
                  Version
                </span>
                <span className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold">
                  {currentVersion ?? 'Loading...'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-[family-name:var(--font-sans)] text-sm">
                  Author
                </span>
                <span className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold">
                  Andres Godina
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-[family-name:var(--font-sans)] text-sm">
                  License
                </span>
                <span className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold">
                  MIT
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid auto-rows-fr gap-4 lg:grid-cols-2">
          <div className="glass-card flex h-full flex-col gap-5 p-5">
            <CategoryManager />
          </div>

          <div className="glass-card flex h-full flex-col gap-5 p-5">
            <TagManager />
          </div>
        </div>
      </div>
    </div>
  )
}

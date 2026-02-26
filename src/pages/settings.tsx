import { useSettings } from '@/hooks/use-settings'
import { useTheme } from '@/components/theme-provider'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { getCurrencyOptions } from '@/lib/currency'
import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CategoryManager } from '@/components/categories/category-manager'
import { DataManagement } from '@/components/settings/data-management'
import { CardManager } from '@/components/settings/card-manager'
import { SettingsSkeleton } from '@/components/settings/settings-skeleton'
import type { Theme } from '@/types/settings'
import type { CurrencyCode } from '@/lib/currency'

export function SettingsPage() {
  const { settings, isLoading, setCurrency, refresh: refetchSettings } = useSettings()
  const { theme, setTheme } = useTheme()
  const { fetch: refetchSubscriptions } = useSubscriptionStore()
  const { fetch: refetchCategories } = useCategoryStore()

  const handleDataChanged = () => {
    refetchSettings()
    refetchSubscriptions()
    refetchCategories()
  }

  if (isLoading || !settings) {
    return <SettingsSkeleton />
  }

  const themeOptions: { value: Theme; label: string; icon: React.ElementType }[] = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  const currencyOptions = getCurrencyOptions()

  return (
    <div className="animate-fade-in-up flex flex-col space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">Customize your Subby experience</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-foreground text-lg font-bold">Appearance</h2>
            <p className="text-muted-foreground text-sm">Customize how Subby looks</p>
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
        </div>

        <div className="glass-card flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-foreground text-lg font-bold">Preferences</h2>
            <p className="text-muted-foreground text-sm">Set your default options</p>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
              Default Currency
            </span>
            <Select value={settings.currency} onValueChange={(value) => setCurrency(value)}>
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
        </div>

        <div className="glass-card flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-foreground text-lg font-bold">Data Management</h2>
            <p className="text-muted-foreground text-sm">Export and import your data</p>
          </div>

          <DataManagement onDataChanged={handleDataChanged} />
        </div>

        <div className="glass-card flex flex-col gap-6 p-6">
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
                0.1.0
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

        <div className="glass-card flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-foreground text-lg font-bold">Payment Cards</h2>
            <p className="text-muted-foreground text-sm">Manage your payment methods</p>
          </div>

          <CardManager currency={settings.currency as CurrencyCode} />
        </div>

        <div className="glass-card flex flex-col gap-6 p-6">
          <CategoryManager />
        </div>
      </div>
    </div>
  )
}

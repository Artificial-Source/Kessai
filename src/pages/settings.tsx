import { useSettings } from '@/hooks/use-settings'
import { useTheme } from '@/components/theme-provider'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { getCurrencyOptions } from '@/lib/currency'
import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { AppLogo } from '@/components/layout/app-logo'
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
    return (
      <div className="flex h-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  const themeOptions: { value: Theme; label: string; icon: React.ElementType }[] = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  const currencyOptions = getCurrencyOptions()

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-foreground mb-1 text-3xl font-semibold tracking-tight md:text-4xl">
          Settings
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Customize your Subby experience
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card space-y-6 rounded-xl p-6">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Appearance</h2>
            <p className="text-muted-foreground text-sm">Customize how Subby looks</p>
          </div>

          <div className="space-y-3">
            <Label>Theme</Label>
            <div className="flex gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={theme === value ? 'default' : 'outline'}
                  className="flex-1 gap-2"
                  onClick={() => setTheme(value)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card space-y-6 rounded-xl p-6">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Preferences</h2>
            <p className="text-muted-foreground text-sm">Set your default options</p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="currency">Default Currency</Label>
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

        <div className="glass-card space-y-6 rounded-xl p-6">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Data Management</h2>
            <p className="text-muted-foreground text-sm">Export and import your data</p>
          </div>

          <DataManagement onDataChanged={handleDataChanged} />
        </div>

        <div className="glass-card space-y-6 rounded-xl p-6">
          <div>
            <h2 className="text-foreground text-lg font-semibold">About</h2>
            <p className="text-muted-foreground text-sm">Application information</p>
          </div>

          <div className="space-y-4">
            <AppLogo />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="text-foreground font-medium">0.1.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Author</span>
              <span className="text-foreground font-medium">Andres Godina</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">License</span>
              <span className="text-foreground font-medium">MIT</span>
            </div>
          </div>
        </div>

        <div className="glass-card space-y-6 rounded-xl p-6">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Payment Cards</h2>
            <p className="text-muted-foreground text-sm">Manage your payment methods</p>
          </div>

          <CardManager currency={settings.currency as CurrencyCode} />
        </div>

        <div className="glass-card space-y-6 rounded-xl p-6">
          <CategoryManager />
        </div>
      </div>
    </div>
  )
}

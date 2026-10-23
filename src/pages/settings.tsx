import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Check, Monitor, Moon, RotateCw, Sun, TriangleAlert, X } from 'lucide-react'
import { useSettings } from '@/hooks/use-settings'
import { useTheme } from '@/components/theme-provider'
import { useSettingsStore } from '@/stores/settings-store'
import { useUpdateStore } from '@/stores/update-store'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldError, FieldHint } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencySelect } from '@/components/ui/currency-select'
import { WebBackendBanner } from '@/components/ui/web-backend-banner'
import { CategoryManager } from '@/components/categories/category-manager'
import { TagManager } from '@/components/tags/tag-manager'
import { DataManagement } from '@/components/settings/data-management'
import { CardManager } from '@/components/settings/card-manager'
import { NotificationSettings } from '@/components/settings/notification-settings'
import { MotionSettings } from '@/components/settings/motion-settings'
import { SettingsSkeleton } from '@/components/settings/settings-skeleton'
import { UpdateSettings } from '@/components/settings/update-settings'
import { PrivateWebAccess } from '@/components/settings/private-web-access'
import { AutostartSettings } from '@/components/settings/autostart-settings'
import { AccessStatus } from '@/components/settings/access-status'
import { SettingsSection } from '@/components/settings/settings-section'
import { isWebApiUnavailableError } from '@/lib/api'
import { isTauriRuntime } from '@/lib/runtime'
import { refreshAppData } from '@/lib/refresh-app-data'
import { cn } from '@/lib/utils'
import type { Theme } from '@/types/settings'
import type { CurrencyCode } from '@/lib/currency'
import { version as bundledVersion } from '../../package.json'

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
]

type SectionLink = { id: string; label: string }

function settingsSections(isDesktopRuntime: boolean): SectionLink[] {
  // Ordered by how often people come here: look and totals first, host plumbing last.
  return [
    { id: 'appearance', label: 'Appearance' },
    { id: 'budget', label: 'Budget' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'categories', label: 'Categories' },
    { id: 'tags', label: 'Tags' },
    { id: 'cards', label: 'Payment Cards' },
    { id: 'data', label: 'Data & Backup' },
    { id: 'motion', label: 'Motion' },
    ...(isDesktopRuntime
      ? [
          { id: 'web-access', label: 'Private Web Access' },
          { id: 'desktop-app', label: 'Desktop App' },
        ]
      : []),
    { id: 'about', label: 'About' },
  ]
}

function scrollBehavior(): ScrollBehavior {
  const reduced =
    document.documentElement.classList.contains('reduce-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return reduced ? 'auto' : 'smooth'
}

/** A section is current once its top passes this far below the top of the scroll area. */
const ACTIVATION_OFFSET = 96
/** A jump counts as settled after this long without a scroll event. */
const SCROLL_SETTLE_MS = 150
/** How long a deep-linked section stays pinned while the sections above it load. */
const DEEP_LINK_PIN_MS = 3000

/**
 * Sticky in-page navigation (lg and up) that tracks the section in view: the last section
 * whose top has scrolled past the activation line, or the last section once the page can
 * scroll no further. A jump (click or deep link) sets the target directly and holds it until
 * its scroll settles; after that the jumped-to section stays current while its top sits in
 * the activation band (between the scroll area's top and the activation line), so a short
 * section near the end, which can never reach the top, is not overruled by the last one.
 */
function SettingsNav({ links }: { links: SectionLink[] }) {
  const idsKey = links.map((link) => link.id).join(',')
  const [activeId, setActiveId] = useState(() => {
    const hash = window.location.hash.slice(1)
    return links.some((link) => link.id === hash) ? hash : links[0]?.id
  })
  const settleTimer = useRef<number | undefined>(undefined)
  const isJumping = useRef(false)
  const pinnedId = useRef<string | null>(null)

  const holdForJump = useCallback(() => {
    isJumping.current = true
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      isJumping.current = false
    }, SCROLL_SETTLE_MS)
  }, [])

  useEffect(() => {
    const root = document.getElementById('main-content')
    if (!root) return
    const ids = idsKey.split(',')
    // A deep link (/settings#data) scrolls the page right after mount; treat it as a jump.
    const hash = window.location.hash.slice(1)
    if (ids.includes(hash)) {
      pinnedId.current = hash
      holdForJump()
    }

    let frame = 0
    const update = () => {
      frame = 0
      const rootTop = root.getBoundingClientRect().top
      const pinned = pinnedId.current ? document.getElementById(pinnedId.current) : null
      if (pinned) {
        const top = pinned.getBoundingClientRect().top - rootTop
        if (top >= -1 && top <= ACTIVATION_OFFSET) {
          setActiveId(pinned.id)
          return
        }
        pinnedId.current = null
      }
      const sections = ids
        .map((id) => document.getElementById(id))
        .filter((section): section is HTMLElement => section !== null)
      if (sections.length === 0) return
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
        setActiveId(sections[sections.length - 1].id)
        return
      }
      const line = rootTop + ACTIVATION_OFFSET
      let current = sections[0].id
      for (const section of sections) {
        if (section.getBoundingClientRect().top > line) break
        current = section.id
      }
      setActiveId(current)
    }
    const onScroll = () => {
      if (isJumping.current) {
        holdForJump()
        return
      }
      if (!frame) frame = requestAnimationFrame(update)
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer.current)
      isJumping.current = false
      pinnedId.current = null
    }
  }, [idsKey, holdForJump])

  const jumpTo = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const section = document.getElementById(id)
    if (!section) return
    event.preventDefault()
    holdForJump()
    pinnedId.current = id
    setActiveId(id)
    section.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    document.getElementById(`${id}-title`)?.focus({ preventScroll: true })
    window.history.replaceState(window.history.state, '', `#${id}`)
  }

  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-6 hidden w-48 shrink-0 self-start lg:block"
    >
      <ul className="flex flex-col gap-0.5">
        {links.map((link) => {
          const active = link.id === activeId
          return (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                onClick={(event) => jumpTo(event, link.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors duration-150',
                  active
                    ? 'bg-accent-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent-muted hover:text-foreground'
                )}
              >
                {link.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function PageHeader() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="text-muted-foreground text-sm">Customize your Kessai experience</p>
    </header>
  )
}

export function SettingsPage() {
  const {
    settings,
    error,
    refresh,
    setNotifications,
    setNotificationDaysBefore,
    setNotificationTime,
    update,
  } = useSettings()
  const { theme, setTheme } = useTheme()
  const setBudget = useSettingsStore((state) => state.setBudget)
  const currentVersion = useUpdateStore((state) => state.currentVersion)
  const isDesktopRuntime = isTauriRuntime()
  const sectionLinks = settingsSections(isDesktopRuntime)
  const [budgetInput, setBudgetInput] = useState(settings?.monthly_budget?.toString() ?? '')
  const [budgetSaved, setBudgetSaved] = useState(false)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const isInitialized = useRef(false)
  const hasSettings = settings !== null

  const handleDataChanged = async (restored = false) => {
    if (restored) isInitialized.current = false
    try {
      await refreshAppData()
    } catch (error) {
      toast.error('Data saved; refresh failed', {
        description:
          error instanceof Error ? error.message : 'Reload the app to refresh your data.',
      })
    } finally {
      const refreshedSettings = useSettingsStore.getState().settings
      if (restored && refreshedSettings) {
        setTheme(refreshedSettings.theme)
        setBudgetInput(refreshedSettings.monthly_budget?.toString() ?? '')
        isInitialized.current = true
      }
    }
  }

  // Sync budgetInput when settings load for the first time
  useEffect(() => {
    if (!isInitialized.current && settings) {
      setBudgetInput(settings.monthly_budget?.toString() ?? '')
      isInitialized.current = true
    }
  }, [settings])

  // Debounced auto-save for budget; an invalid amount is reported, never silently dropped.
  useEffect(() => {
    const currentBudgetStr = settings?.monthly_budget?.toString() ?? ''
    if (budgetInput === currentBudgetStr || budgetInput.trim() === '') return

    const timer = setTimeout(async () => {
      const val = Number(budgetInput)
      if (!Number.isFinite(val) || val <= 0) {
        setBudgetError('Enter an amount greater than 0, or clear the budget.')
        return
      }
      try {
        await setBudget(val)
        setBudgetSaved(true)
        setTimeout(() => setBudgetSaved(false), 2000)
      } catch {
        toast.error("Couldn't save the budget", { description: 'Try again.' })
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [budgetInput, settings?.monthly_budget, setBudget])

  // A deep link such as /settings#data lands on its section once the page has content, and
  // stays there while the lists above it (categories, tags, cards) load and change height.
  // The pin lets go as soon as the person scrolls, types, or taps, or after a few seconds.
  useEffect(() => {
    if (!hasSettings) return
    const target = document.getElementById(window.location.hash.slice(1))
    if (!target?.parentElement) return
    const pin = () => target.scrollIntoView({ block: 'start' })
    pin()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(pin)
    observer?.observe(target.parentElement)
    const userInput = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    const release = () => {
      observer?.disconnect()
      window.clearTimeout(timer)
      for (const type of userInput) window.removeEventListener(type, release, true)
    }
    const timer = window.setTimeout(release, DEEP_LINK_PIN_MS)
    for (const type of userInput) {
      window.addEventListener(type, release, { capture: true, passive: true })
    }
    return release
  }, [hasSettings])

  const clearBudget = useCallback(async () => {
    try {
      await setBudget(null)
      setBudgetInput('')
      setBudgetError(null)
      setBudgetSaved(false)
    } catch {
      toast.error("Couldn't clear the budget", { description: 'Try again.' })
    }
  }, [setBudget])

  if (!settings) {
    if (!error)
      return (
        <div className="flex flex-col gap-6">
          <PageHeader />
          <SettingsSkeleton />
        </div>
      )
    return (
      <div className="animate-fade-in-up flex flex-col gap-6">
        <PageHeader />
        <WebBackendBanner error={error} />
        <div role="alert">
          <EmptyState
            icon={TriangleAlert}
            tone="danger"
            title="Couldn't load settings"
            description="Nothing here can change until your settings load. Check that Kessai is running, then retry."
            action={
              <Button variant="outline" onClick={() => void refresh?.()}>
                <RotateCw aria-hidden="true" />
                Retry
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  const handleDefaultCurrencyChange = async (value: CurrencyCode) => {
    try {
      await update({ currency: value })
      toast.success(`Totals now in ${value}`)
    } catch {
      toast.error("Couldn't change the default currency", { description: 'Try again.' })
    }
  }

  const hasBudget =
    (settings.monthly_budget !== null && settings.monthly_budget !== undefined) ||
    budgetInput !== ''
  const showAccessStatus = !isDesktopRuntime && !isWebApiUnavailableError(error)

  return (
    <div className="animate-fade-in-up flex flex-col gap-6">
      <PageHeader />

      <div className="flex gap-10">
        <SettingsNav links={sectionLinks} />

        <div className="flex max-w-3xl min-w-0 flex-1 flex-col gap-6">
          <WebBackendBanner error={error} />
          {showAccessStatus ? <AccessStatus /> : null}

          <SettingsSection
            id="appearance"
            title="Appearance"
            description="How Kessai looks and the currency it totals in."
          >
            <div className="flex flex-col gap-2">
              <span id="theme-label" className="text-sm leading-none font-medium">
                Theme
              </span>
              <div
                role="group"
                aria-labelledby="theme-label"
                className="grid grid-cols-3 gap-2 sm:max-w-md"
              >
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    variant="outline"
                    onClick={() => setTheme(value)}
                    aria-pressed={theme === value}
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="border-border flex flex-col gap-2 border-t pt-5">
              <Label htmlFor="currency">Default currency</Label>
              <CurrencySelect
                id="currency"
                value={settings.currency}
                onValueChange={(value) => void handleDefaultCurrencyChange(value)}
                className="sm:max-w-md"
              />
              <FieldHint>
                Totals use this currency, and new subscriptions start in it. Kessai doesn&rsquo;t
                convert between currencies.
              </FieldHint>
            </div>
          </SettingsSection>

          <SettingsSection
            id="budget"
            title="Budget"
            description="A monthly limit the dashboard compares your spending against."
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="monthly_budget">Monthly budget</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="monthly_budget"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 100.00"
                  value={budgetInput}
                  onChange={(e) => {
                    setBudgetInput(e.target.value)
                    setBudgetError(null)
                  }}
                  aria-invalid={Boolean(budgetError)}
                  aria-describedby={budgetError ? 'budget-error' : 'budget-hint'}
                  className="w-full sm:w-56"
                />
                {hasBudget ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Clear budget"
                    onClick={() => void clearBudget()}
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              {budgetError ? (
                <FieldError id="budget-error">{budgetError}</FieldError>
              ) : (
                <FieldHint
                  id="budget-hint"
                  aria-live="polite"
                  className="flex items-center gap-1.5"
                >
                  {budgetSaved ? (
                    <>
                      <Check className="size-3.5" aria-hidden="true" />
                      Saved
                    </>
                  ) : (
                    `In ${settings.currency}. Saves automatically.`
                  )}
                </FieldHint>
              )}
            </div>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title="Notifications"
            description="Reminders before subscriptions renew."
          >
            <NotificationSettings
              settings={settings}
              onToggle={(enabled) => setNotifications(enabled)}
              onDaysBeforeChange={setNotificationDaysBefore}
              onTimeChange={setNotificationTime}
            />
          </SettingsSection>

          <CategoryManager />
          <TagManager />
          <CardManager currency={settings.currency} />

          <SettingsSection
            id="data"
            title="Data & Backup"
            description="Your data lives in one file on this machine. Back it up, restore it, or import from elsewhere."
          >
            <DataManagement onDataChanged={handleDataChanged} />
          </SettingsSection>

          <SettingsSection
            id="motion"
            title="Motion"
            description="Animations, transitions, and hover effects."
          >
            <MotionSettings settings={settings} />
          </SettingsSection>

          {isDesktopRuntime ? (
            <>
              <PrivateWebAccess />
              <SettingsSection
                id="desktop-app"
                title="Desktop App"
                description="Startup and updates for the installed app."
              >
                <div className="divide-border flex flex-col divide-y [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
                  <AutostartSettings />
                  <UpdateSettings />
                </div>
              </SettingsSection>
            </>
          ) : null}

          <SettingsSection id="about" title="About">
            <dl className="divide-border flex flex-col divide-y text-sm">
              {[
                ['Version', currentVersion ?? bundledVersion],
                ['Author', 'Andres Godina'],
                ['License', 'MIT'],
                ...(isDesktopRuntime
                  ? []
                  : [['Updates', 'Installed and checked by the desktop app']]),
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd
                    className={cn(
                      'text-foreground text-right',
                      term === 'Updates'
                        ? 'text-sm'
                        : 'font-[family-name:var(--font-mono)] font-bold'
                    )}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}

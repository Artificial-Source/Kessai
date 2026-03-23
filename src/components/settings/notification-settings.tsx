import { useState } from 'react'
import { toast } from 'sonner'
import { Bell, BellOff, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ReminderPreview } from '@/components/settings/reminder-preview'
import type { Settings } from '@/types/settings'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

interface NotificationSettingsProps {
  settings: Settings
  onToggle: (enabled: boolean) => Promise<void>
  onDaysBeforeChange: (days: number[]) => Promise<void>
  onTimeChange: (time: string) => Promise<void>
}

const ADVANCE_DAY_OPTIONS = [1, 3, 7, 14, 30] as const

export function NotificationSettings({
  settings,
  onToggle,
  onDaysBeforeChange,
  onTimeChange,
}: NotificationSettingsProps) {
  const [isSendingTest, setIsSendingTest] = useState(false)

  const handleToggle = async () => {
    const newEnabled = !settings.notification_enabled

    if (newEnabled) {
      try {
        let granted = await isPermissionGranted()
        if (!granted) {
          const permission = await requestPermission()
          granted = permission === 'granted'
        }
        if (!granted) {
          toast.error('Notification permission denied by your system')
          return
        }
      } catch {
        // In dev mode or non-Tauri env, permission check may fail
        console.warn('Could not check notification permission')
      }
    }

    try {
      await onToggle(newEnabled)
      toast.success(newEnabled ? 'Notifications enabled' : 'Notifications disabled')
    } catch {
      toast.error('Failed to update notification settings')
    }
  }

  const handleDayToggle = async (day: number) => {
    const current = settings.notification_days_before ?? []
    let updated: number[]

    if (current.includes(day)) {
      updated = current.filter((d) => d !== day)
    } else {
      updated = [...current, day].sort((a, b) => a - b)
    }

    try {
      await onDaysBeforeChange(updated)
    } catch {
      toast.error('Failed to update advance notice')
    }
  }

  const handleTimeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value
    if (!time) return
    try {
      await onTimeChange(time)
    } catch {
      toast.error('Failed to update notification time')
    }
  }

  const handleTestNotification = async () => {
    setIsSendingTest(true)
    try {
      let granted = await isPermissionGranted()
      if (!granted) {
        const permission = await requestPermission()
        granted = permission === 'granted'
      }

      if (!granted) {
        toast.error('Notification permission denied')
        return
      }

      sendNotification({
        title: 'Subby — Test Notification',
        body: 'Notifications are working. You will be reminded about upcoming renewals.',
      })

      toast.success('Test notification sent')
    } catch {
      toast.error('Failed to send test notification')
    } finally {
      setIsSendingTest(false)
    }
  }

  const activeDays = settings.notification_days_before ?? []

  return (
    <div className="flex flex-col gap-6">
      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {settings.notification_enabled ? (
            <Bell className="text-primary h-5 w-5" />
          ) : (
            <BellOff className="text-muted-foreground h-5 w-5" />
          )}
          <div>
            <p className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
              Desktop Notifications
            </p>
            <p className="text-muted-foreground text-xs">Get reminded before subscriptions renew</p>
          </div>
        </div>
        <Button
          variant={settings.notification_enabled ? 'default' : 'outline'}
          onClick={handleToggle}
          className="min-w-[80px]"
        >
          {settings.notification_enabled ? 'On' : 'Off'}
        </Button>
      </div>

      {settings.notification_enabled && (
        <>
          {/* Advance notice — multi-select chips */}
          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
              Remind Me Before
            </span>
            <div className="flex flex-wrap gap-2">
              {ADVANCE_DAY_OPTIONS.map((day) => {
                const isActive = activeDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayToggle(day)}
                    aria-pressed={isActive}
                    aria-label={`Remind ${day} day${day !== 1 ? 's' : ''} before`}
                    className={`border px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground hover:border-foreground/20'
                    }`}
                  >
                    {day}d
                  </button>
                )
              })}
            </div>
            <p className="text-muted-foreground text-xs">
              {activeDays.length === 0
                ? 'Select when to be reminded before renewals'
                : `Reminders ${activeDays.map((d) => `${d} day${d !== 1 ? 's' : ''}`).join(', ')} before`}
            </p>
          </div>

          {/* Time picker */}
          <div className="flex flex-col gap-3">
            <label
              htmlFor="notification-time"
              className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase"
            >
              Notification Time
            </label>
            <Input
              id="notification-time"
              type="time"
              value={settings.notification_time}
              onChange={handleTimeChange}
              className="w-full"
            />
            <p className="text-muted-foreground text-xs">
              When to check and send daily renewal reminders
            </p>
          </div>

          {/* Upcoming reminders preview */}
          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
              Upcoming Reminders
            </span>
            <ReminderPreview daysBefore={activeDays} />
          </div>

          {/* Test notification */}
          <div className="border-border flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
                Test Notification
              </p>
              <p className="text-muted-foreground text-xs">
                Send a test to verify notifications work
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleTestNotification}
              disabled={isSendingTest}
              className="shrink-0 gap-2"
            >
              <Send className="h-4 w-4" />
              {isSendingTest ? 'Sending...' : 'Test'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

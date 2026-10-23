import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldHint } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { isTauriRuntime } from '@/lib/runtime'
import { SettingRow } from '@/components/settings/settings-section'
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

const dayCount = (days: number) => `${days} day${days === 1 ? '' : 's'}`

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
          toast.error('Notifications are blocked', {
            description: 'Allow notifications for Kessai in your system settings, then try again.',
          })
          return
        }
      } catch {
        // In dev mode or non-Tauri env, permission check may fail
        console.warn('Could not check notification permission')
      }
    }

    try {
      await onToggle(newEnabled)
      toast.success(newEnabled ? 'Renewal reminders on' : 'Renewal reminders off')
    } catch {
      toast.error("Couldn't change renewal reminders", { description: 'Try again.' })
    }
  }

  const handleDayToggle = async (day: number) => {
    const current = settings.notification_days_before ?? []
    const updated = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b)

    try {
      await onDaysBeforeChange(updated)
    } catch {
      toast.error("Couldn't save reminder days", { description: 'Try again.' })
    }
  }

  const handleTimeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value
    if (!time) return
    try {
      await onTimeChange(time)
    } catch {
      toast.error("Couldn't save the reminder time", { description: 'Try again.' })
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
        toast.error('Notifications are blocked', {
          description: 'Allow notifications for Kessai in your system settings, then try again.',
        })
        return
      }

      sendNotification({
        title: 'Kessai — Test Notification',
        body: 'Notifications are working. You will be reminded about upcoming renewals.',
      })

      toast.success('Test notification sent')
    } catch {
      toast.error("Couldn't send a test notification", { description: 'Try again.' })
    } finally {
      setIsSendingTest(false)
    }
  }

  const activeDays = settings.notification_days_before ?? []

  return (
    <div className="divide-border flex flex-col divide-y [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      <SettingRow
        label="Renewal reminders"
        htmlFor="notifications-enabled"
        description="Desktop notifications before a subscription renews."
      >
        <Switch
          id="notifications-enabled"
          checked={settings.notification_enabled}
          onCheckedChange={() => void handleToggle()}
        />
      </SettingRow>

      {settings.notification_enabled ? (
        <>
          <div className="flex flex-col gap-2">
            <span id="reminder-days-label" className="text-sm leading-none font-medium">
              Remind me before renewal
            </span>
            <div
              role="group"
              aria-labelledby="reminder-days-label"
              aria-describedby="reminder-days-hint"
              className="flex flex-wrap gap-2"
            >
              {ADVANCE_DAY_OPTIONS.map((day) => (
                <Button
                  key={day}
                  variant="outline"
                  size="sm"
                  aria-pressed={activeDays.includes(day)}
                  onClick={() => void handleDayToggle(day)}
                  className="tabular-nums"
                >
                  {dayCount(day)}
                </Button>
              ))}
            </div>
            <FieldHint id="reminder-days-hint">
              {activeDays.length === 0
                ? 'Pick at least one to get reminders.'
                : `You'll be reminded ${activeDays.map(dayCount).join(', ')} before each renewal.`}
            </FieldHint>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notification-time">Reminder time</Label>
            <Input
              id="notification-time"
              type="time"
              value={settings.notification_time}
              onChange={handleTimeChange}
              aria-describedby="notification-time-hint"
              className="sm:w-40"
            />
            <FieldHint id="notification-time-hint">
              Kessai checks for upcoming renewals once a day at this time.
            </FieldHint>
          </div>

          {isTauriRuntime() ? (
            <SettingRow
              label="Test notification"
              description="Send one now to check that reminders reach you."
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleTestNotification()}
                disabled={isSendingTest}
                aria-busy={isSendingTest}
              >
                {isSendingTest ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send aria-hidden="true" />
                )}
                Send test
              </Button>
            </SettingRow>
          ) : (
            // Desktop-only controls appear only where they work (principle 5).
            <FieldHint>
              Reminders arrive as desktop notifications from the Kessai app, not this browser, so
              there&rsquo;s nothing to test here.
            </FieldHint>
          )}
        </>
      ) : null}
    </div>
  )
}

import { useState } from 'react'
import { toast } from 'sonner'
import { Bell, BellOff, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Settings } from '@/types/settings'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

interface NotificationSettingsProps {
  settings: Settings
  onToggle: (enabled: boolean) => Promise<void>
  onAdvanceDaysChange: (days: number) => Promise<void>
  onTimeChange: (time: string) => Promise<void>
}

const ADVANCE_OPTIONS = [
  { value: '1', label: '1 day before' },
  { value: '2', label: '2 days before' },
  { value: '3', label: '3 days before' },
  { value: '5', label: '5 days before' },
  { value: '7', label: '7 days before' },
  { value: '14', label: '14 days before' },
]

export function NotificationSettings({
  settings,
  onToggle,
  onAdvanceDaysChange,
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

  const handleAdvanceDaysChange = async (value: string) => {
    try {
      await onAdvanceDaysChange(parseInt(value, 10))
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
          {/* Advance notice selector */}
          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
              Advance Notice
            </span>
            <Select
              value={String(settings.notification_advance_days)}
              onValueChange={handleAdvanceDaysChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select advance notice" />
              </SelectTrigger>
              <SelectContent>
                {ADVANCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              How far in advance to notify you about upcoming renewals
            </p>
          </div>

          {/* Time picker */}
          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
              Notification Time
            </span>
            <Input
              type="time"
              value={settings.notification_time}
              onChange={handleTimeChange}
              className="w-full"
            />
            <p className="text-muted-foreground text-xs">
              When to check and send daily renewal reminders
            </p>
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

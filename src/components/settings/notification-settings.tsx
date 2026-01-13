import { motion, AnimatePresence } from 'framer-motion'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Settings } from '@/types/settings'

interface NotificationSettingsProps {
  settings: Settings
  onUpdate: (data: Partial<Settings>) => Promise<void>
}

export function NotificationSettings({ settings, onUpdate }: NotificationSettingsProps) {
  const toggleNotifications = () => {
    onUpdate({ notification_enabled: !settings.notification_enabled })
  }

  const toggleDay = (days: number) => {
    const currentDays = settings.notification_days_before
    const isActive = currentDays.includes(days)
    const newDays = isActive
      ? currentDays.filter((d) => d !== days)
      : [...currentDays, days].sort((a, b) => a - b)
    onUpdate({ notification_days_before: newDays })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20">
            <Bell className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <p className="font-medium">Payment Reminders</p>
            <p className="text-muted-foreground text-sm">Get notified before payments are due</p>
          </div>
        </div>
        <Button
          variant={settings.notification_enabled ? 'default' : 'outline'}
          onClick={toggleNotifications}
          className={cn(settings.notification_enabled && 'bg-violet-500 hover:bg-violet-600')}
        >
          {settings.notification_enabled ? 'Enabled' : 'Disabled'}
        </Button>
      </div>

      <AnimatePresence>
        {settings.notification_enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-6 overflow-hidden"
          >
            <div className="space-y-3">
              <Label>Remind me before</Label>
              <div className="flex flex-wrap gap-2">
                {[1, 3, 7, 14, 30].map((days) => {
                  const isActive = settings.notification_days_before.includes(days)
                  return (
                    <Button
                      key={days}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDay(days)}
                      className={cn(isActive && 'bg-violet-500 hover:bg-violet-600')}
                    >
                      {days === 1 ? '1 day' : `${days} days`}
                    </Button>
                  )
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                Upcoming payments will be highlighted in the dashboard and calendar
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

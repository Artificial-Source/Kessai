import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'

export function useTrialCountdown(trialEndDate: string | null | undefined) {
  const [, refreshDay] = useState(0)
  const today = dayjs().format('YYYY-MM-DD')
  useEffect(() => {
    if (!trialEndDate) return
    let timer: ReturnType<typeof setTimeout>
    const scheduleMidnight = () => {
      const now = dayjs()
      timer = setTimeout(() => {
        refreshDay((day) => day + 1)
        scheduleMidnight()
      }, now.add(1, 'day').startOf('day').diff(now))
    }
    scheduleMidnight()
    return () => clearTimeout(timer)
  }, [trialEndDate])

  return useMemo(() => {
    if (!trialEndDate) {
      return {
        daysRemaining: null,
        isExpiringSoon: false,
        isExpired: false,
        formattedCountdown: null,
      }
    }

    const endDate = dayjs(trialEndDate)
    const daysRemaining = endDate.startOf('day').diff(dayjs(today), 'day')

    return {
      daysRemaining,
      isExpiringSoon: daysRemaining >= 0 && daysRemaining <= 3,
      isExpired: daysRemaining < 0,
      formattedCountdown:
        daysRemaining < 0
          ? 'Expired'
          : daysRemaining === 0
            ? 'Ends today'
            : daysRemaining === 1
              ? '1 day left'
              : `${daysRemaining} days left`,
    }
  }, [trialEndDate, today])
}

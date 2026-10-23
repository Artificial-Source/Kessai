import { useEffect, useState } from 'react'
import dayjs from 'dayjs'

const today = () => dayjs().format('YYYY-MM-DD')

/** Today's local date (YYYY-MM-DD), updated at midnight while the caller stays mounted. */
export function useToday(): string {
  const [date, setDate] = useState(today)
  useEffect(() => {
    const now = dayjs()
    const timer = setTimeout(
      () => setDate(today()),
      now.add(1, 'day').startOf('day').diff(now) + 50
    )
    return () => clearTimeout(timer)
  }, [date])
  return date
}

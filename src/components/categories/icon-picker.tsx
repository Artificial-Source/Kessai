import * as LucideIcons from 'lucide-react'
import { CATEGORY_ICONS } from '@/types/category'
import { cn } from '@/lib/utils'

type IconPickerProps = {
  value: string
  onChange: (icon: string) => void
}

const iconComponents: Record<string, LucideIcons.LucideIcon> = {
  'play-circle': LucideIcons.PlayCircle,
  code: LucideIcons.Code,
  'gamepad-2': LucideIcons.Gamepad2,
  music: LucideIcons.Music,
  cloud: LucideIcons.Cloud,
  briefcase: LucideIcons.Briefcase,
  'heart-pulse': LucideIcons.HeartPulse,
  newspaper: LucideIcons.Newspaper,
  box: LucideIcons.Box,
  tv: LucideIcons.Tv,
  film: LucideIcons.Film,
  'book-open': LucideIcons.BookOpen,
  'shopping-cart': LucideIcons.ShoppingCart,
  car: LucideIcons.Car,
  home: LucideIcons.Home,
  globe: LucideIcons.Globe,
  phone: LucideIcons.Phone,
  wifi: LucideIcons.Wifi,
  'credit-card': LucideIcons.CreditCard,
  gift: LucideIcons.Gift,
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {CATEGORY_ICONS.map((iconName) => {
        const IconComponent = iconComponents[iconName]
        if (!IconComponent) return null

        return (
          <button
            key={iconName}
            type="button"
            onClick={() => onChange(iconName)}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg transition-all',
              value === iconName
                ? 'bg-primary text-primary-foreground ring-ring ring-offset-background ring-2 ring-offset-2'
                : 'bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <IconComponent className="h-5 w-5" />
          </button>
        )
      })}
    </div>
  )
}

export function CategoryIconDisplay({ icon, className }: { icon: string; className?: string }) {
  const IconComponent = iconComponents[icon] || LucideIcons.Box
  return <IconComponent className={className} />
}

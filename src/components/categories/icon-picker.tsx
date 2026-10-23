import * as LucideIcons from 'lucide-react'
import { CATEGORY_ICONS } from '@/types/category'
import { cn } from '@/lib/utils'

type IconPickerProps = {
  value: string
  onChange: (icon: string) => void
  /** Id of the visible label that names the group. */
  labelledBy?: string
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

export function IconPicker({ value, onChange, labelledBy }: IconPickerProps) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {CATEGORY_ICONS.map((iconName) => {
        const IconComponent = iconComponents[iconName]
        if (!IconComponent) return null
        const selected = value === iconName

        return (
          <button
            key={iconName}
            type="button"
            onClick={() => onChange(iconName)}
            aria-label={iconName.replace(/-\d+$/, '').replace(/-/g, ' ')}
            aria-pressed={selected}
            className={cn(
              'flex size-10 items-center justify-center rounded-md border transition-colors duration-150 pointer-coarse:size-11',
              selected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input-border text-muted-foreground hover:border-border-hover hover:text-foreground'
            )}
          >
            <IconComponent className="size-5" aria-hidden="true" />
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

import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings-store'

/**
 * Applies motion/animation settings to the document root element as CSS custom properties
 * and CSS classes so all animations respond to user preferences.
 */
export function useMotionSettings() {
  const settings = useSettingsStore((state) => state.settings)

  useEffect(() => {
    if (!settings) return

    const root = document.documentElement

    if (settings.reduce_motion) {
      // Master kill switch: disable all animations
      root.style.setProperty('--animation-duration', '0s')
      root.style.setProperty('--transition-duration', '0s')
      root.style.setProperty('--animation-speed-multiplier', '0')
      root.classList.add('reduce-motion')
      root.classList.add('no-hover-effects')
      root.classList.remove('no-transitions')
    } else {
      root.classList.remove('reduce-motion')

      // Animation speed multiplier
      let multiplier: number
      switch (settings.animation_speed) {
        case 'slow':
          multiplier = 1.5
          break
        case 'fast':
          multiplier = 0.5
          break
        default:
          multiplier = 1
      }
      root.style.setProperty('--animation-speed-multiplier', String(multiplier))
      // Set a base duration that CSS animations can reference
      root.style.setProperty('--animation-duration', `${0.3 * multiplier}s`)
      root.style.setProperty('--transition-duration', `${0.2 * multiplier}s`)

      // Page transitions
      if (settings.enable_transitions) {
        root.classList.remove('no-transitions')
      } else {
        root.classList.add('no-transitions')
      }

      // Hover effects
      if (settings.enable_hover_effects) {
        root.classList.remove('no-hover-effects')
      } else {
        root.classList.add('no-hover-effects')
      }
    }

    return () => {
      // Cleanup on unmount
      root.style.removeProperty('--animation-duration')
      root.style.removeProperty('--transition-duration')
      root.style.removeProperty('--animation-speed-multiplier')
      root.classList.remove('reduce-motion', 'no-transitions', 'no-hover-effects')
    }
  }, [settings])
}

import { useCallback, useEffect, useRef } from 'react'
import { Play } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore } from '@/stores/settings-store'
import { Button } from '@/components/ui/button'
import { FieldHint } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingRow } from '@/components/settings/settings-section'
import type { AnimationSpeed, Settings } from '@/types/settings'

type MotionSettingsProps = {
  settings: Settings
}

/** Milliseconds per speed; mirrors the multipliers useMotionSettings applies to 0.3s. */
const SPEED_MS: Record<AnimationSpeed, number> = { slow: 450, normal: 300, fast: 150 }

export function MotionSettings({ settings }: MotionSettingsProps) {
  const { setReduceMotion, setEnableTransitions, setEnableHoverEffects, setAnimationSpeed } =
    useSettingsStore(
      useShallow((state) => ({
        setReduceMotion: state.setReduceMotion,
        setEnableTransitions: state.setEnableTransitions,
        setEnableHoverEffects: state.setEnableHoverEffects,
        setAnimationSpeed: state.setAnimationSpeed,
      }))
    )

  const reduceMotion = settings.reduce_motion
  const speed = settings.animation_speed
  const trackRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLSpanElement>(null)
  const lastSpeed = useRef(speed)

  /** Plays the preview once at the saved speed's duration. */
  const playPreview = useCallback(() => {
    const track = trackRef.current
    const marker = markerRef.current
    if (!track || !marker || typeof marker.animate !== 'function') return
    const easing =
      getComputedStyle(document.documentElement).getPropertyValue('--ease-emphasized').trim() ||
      'ease-out'
    const distance = track.clientWidth - marker.offsetWidth - 8
    marker.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${distance}px)` }], {
      duration: SPEED_MS[speed],
      easing,
      fill: 'forwards',
    })
  }, [speed])

  // A new speed replays the preview once so the difference is visible without a loop.
  useEffect(() => {
    if (lastSpeed.current === speed) return
    lastSpeed.current = speed
    playPreview()
  }, [speed, playPreview])

  return (
    <div className="divide-border flex flex-col divide-y [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      <SettingRow
        label="Reduce motion"
        htmlFor="reduce-motion"
        description="Turns off every animation and transition."
      >
        <Switch
          id="reduce-motion"
          checked={reduceMotion}
          onCheckedChange={(checked) => setReduceMotion(checked)}
        />
      </SettingRow>

      <SettingRow
        label="Page transitions"
        htmlFor="page-transitions"
        description={
          reduceMotion ? 'Off while Reduce motion is on.' : 'Fade and slide between pages.'
        }
      >
        <Switch
          id="page-transitions"
          checked={settings.enable_transitions && !reduceMotion}
          onCheckedChange={(checked) => setEnableTransitions(checked)}
          disabled={reduceMotion}
        />
      </SettingRow>

      <SettingRow
        label="Hover effects"
        htmlFor="hover-effects"
        description={
          reduceMotion ? 'Off while Reduce motion is on.' : 'Lift and highlight cards on hover.'
        }
      >
        <Switch
          id="hover-effects"
          checked={settings.enable_hover_effects && !reduceMotion}
          onCheckedChange={(checked) => setEnableHoverEffects(checked)}
          disabled={reduceMotion}
        />
      </SettingRow>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="animation-speed">Animation speed</Label>
          <Select
            value={reduceMotion ? 'normal' : speed}
            onValueChange={(value) => setAnimationSpeed(value as AnimationSpeed)}
            disabled={reduceMotion}
          >
            <SelectTrigger
              id="animation-speed"
              aria-describedby="animation-speed-hint"
              className="sm:max-w-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slow">Slow (1.5× duration)</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="fast">Fast (0.5× duration)</SelectItem>
            </SelectContent>
          </Select>
          <FieldHint id="animation-speed-hint">
            {reduceMotion
              ? 'Off while Reduce motion is on.'
              : `Animations take ${SPEED_MS[speed]} ms at this speed.`}
          </FieldHint>
        </div>

        {!reduceMotion ? (
          <div className="flex items-center gap-3">
            <div
              ref={trackRef}
              aria-hidden="true"
              className="border-border relative h-9 min-w-0 flex-1 rounded-md border bg-[var(--color-subtle-overlay)]"
            >
              <span
                ref={markerRef}
                className="bg-primary absolute top-1 bottom-1 left-1 w-6 rounded-sm"
              />
            </div>
            <Button variant="outline" size="sm" onClick={playPreview}>
              <Play aria-hidden="true" />
              Preview
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

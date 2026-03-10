import { useSettingsStore } from '@/stores/settings-store'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AnimationSpeed, Settings } from '@/types/settings'

type MotionSettingsProps = {
  settings: Settings
}

export function MotionSettings({ settings }: MotionSettingsProps) {
  const { setReduceMotion, setEnableTransitions, setEnableHoverEffects, setAnimationSpeed } =
    useSettingsStore()

  const isDisabledByReduceMotion = settings.reduce_motion

  return (
    <div className="flex flex-col gap-5">
      {/* Master reduce motion toggle */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
            Reduce Motion
          </span>
          <span className="text-muted-foreground text-xs">
            Disable all animations and transitions
          </span>
        </div>
        <Switch
          checked={settings.reduce_motion}
          onCheckedChange={(checked) => setReduceMotion(checked)}
          aria-label="Reduce motion"
        />
      </div>

      <div className="border-border border-t" />

      {/* Page/component transitions */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span
            className={`font-[family-name:var(--font-sans)] text-sm font-medium ${isDisabledByReduceMotion ? 'text-muted-foreground' : 'text-foreground'}`}
          >
            Page Transitions
          </span>
          <span className="text-muted-foreground text-xs">
            Fade and slide effects when navigating
          </span>
        </div>
        <Switch
          checked={settings.enable_transitions && !isDisabledByReduceMotion}
          onCheckedChange={(checked) => setEnableTransitions(checked)}
          disabled={isDisabledByReduceMotion}
          aria-label="Enable page transitions"
        />
      </div>

      {/* Hover effects */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span
            className={`font-[family-name:var(--font-sans)] text-sm font-medium ${isDisabledByReduceMotion ? 'text-muted-foreground' : 'text-foreground'}`}
          >
            Hover Effects
          </span>
          <span className="text-muted-foreground text-xs">Lift, scale, and glow on hover</span>
        </div>
        <Switch
          checked={settings.enable_hover_effects && !isDisabledByReduceMotion}
          onCheckedChange={(checked) => setEnableHoverEffects(checked)}
          disabled={isDisabledByReduceMotion}
          aria-label="Enable hover effects"
        />
      </div>

      <div className="border-border border-t" />

      {/* Animation speed */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
            Animation Speed
          </span>
          <span className="text-muted-foreground text-xs">Control the speed of all animations</span>
        </div>
        <Select
          value={isDisabledByReduceMotion ? 'normal' : settings.animation_speed}
          onValueChange={(value) => setAnimationSpeed(value as AnimationSpeed)}
          disabled={isDisabledByReduceMotion}
        >
          <SelectTrigger className={isDisabledByReduceMotion ? 'opacity-50' : ''}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="slow">Slow (1.5x duration)</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="fast">Fast (0.5x duration)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Preview indicator */}
      {!isDisabledByReduceMotion && (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
            Preview
          </span>
          <div className="border-border flex items-center gap-3 rounded-lg border p-3">
            <div
              className="bg-primary h-3 w-3 rounded-full"
              style={{
                animation: `fade-in-up var(--animation-duration, 0.3s) ease-out infinite alternate`,
              }}
            />
            <span className="text-muted-foreground text-xs">
              Animation speed:{' '}
              <span className="text-foreground font-[family-name:var(--font-mono)] font-bold">
                {settings.animation_speed}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

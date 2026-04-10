import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMotionSettings } from '../use-motion-settings'
import { useSettingsStore } from '@/stores/settings-store'
import type { Settings } from '@/types/settings'

const defaultSettings: Settings = {
  id: 'singleton',
  theme: 'dark',
  currency: 'USD',
  display_exchange_rates: {},
  notification_enabled: true,
  notification_days_before: [1, 3, 7],
  notification_advance_days: 1,
  notification_time: '09:00',
  monthly_budget: null,
  reduce_motion: false,
  enable_transitions: true,
  enable_hover_effects: true,
  animation_speed: 'normal',
}

describe('useMotionSettings', () => {
  beforeEach(() => {
    // Clean up classes and styles before each test
    const root = document.documentElement
    root.classList.remove('reduce-motion', 'no-transitions', 'no-hover-effects')
    root.style.removeProperty('--animation-duration')
    root.style.removeProperty('--transition-duration')
    root.style.removeProperty('--animation-speed-multiplier')
  })

  afterEach(() => {
    const root = document.documentElement
    root.classList.remove('reduce-motion', 'no-transitions', 'no-hover-effects')
    root.style.removeProperty('--animation-duration')
    root.style.removeProperty('--transition-duration')
    root.style.removeProperty('--animation-speed-multiplier')
  })

  it('does nothing when settings are null', () => {
    useSettingsStore.setState({ settings: null })

    renderHook(() => useMotionSettings())

    const root = document.documentElement
    expect(root.classList.contains('reduce-motion')).toBe(false)
    expect(root.classList.contains('no-transitions')).toBe(false)
    expect(root.classList.contains('no-hover-effects')).toBe(false)
  })

  it('applies reduce-motion class when reduce_motion is true', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, reduce_motion: true },
    })

    renderHook(() => useMotionSettings())

    const root = document.documentElement
    expect(root.classList.contains('reduce-motion')).toBe(true)
    expect(root.style.getPropertyValue('--animation-duration')).toBe('0s')
    expect(root.style.getPropertyValue('--transition-duration')).toBe('0s')
    expect(root.style.getPropertyValue('--animation-speed-multiplier')).toBe('0')
  })

  it('adds no-hover-effects when reduce_motion is true', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, reduce_motion: true },
    })

    renderHook(() => useMotionSettings())

    expect(document.documentElement.classList.contains('no-hover-effects')).toBe(true)
  })

  it('applies no-transitions class when enable_transitions is false', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, enable_transitions: false },
    })

    renderHook(() => useMotionSettings())

    expect(document.documentElement.classList.contains('no-transitions')).toBe(true)
  })

  it('does not apply no-transitions when enable_transitions is true', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, enable_transitions: true },
    })

    renderHook(() => useMotionSettings())

    expect(document.documentElement.classList.contains('no-transitions')).toBe(false)
  })

  it('applies no-hover-effects class when enable_hover_effects is false', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, enable_hover_effects: false },
    })

    renderHook(() => useMotionSettings())

    expect(document.documentElement.classList.contains('no-hover-effects')).toBe(true)
  })

  it('does not apply no-hover-effects when enable_hover_effects is true', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, enable_hover_effects: true },
    })

    renderHook(() => useMotionSettings())

    expect(document.documentElement.classList.contains('no-hover-effects')).toBe(false)
  })

  it('sets slow animation speed multiplier', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, animation_speed: 'slow' },
    })

    renderHook(() => useMotionSettings())

    const root = document.documentElement
    expect(root.style.getPropertyValue('--animation-speed-multiplier')).toBe('1.5')
    // Use toContain to handle floating point: 0.3 * 1.5 = 0.44999...
    expect(parseFloat(root.style.getPropertyValue('--animation-duration'))).toBeCloseTo(0.45)
    expect(parseFloat(root.style.getPropertyValue('--transition-duration'))).toBeCloseTo(0.3)
  })

  it('sets fast animation speed multiplier', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, animation_speed: 'fast' },
    })

    renderHook(() => useMotionSettings())

    const root = document.documentElement
    expect(root.style.getPropertyValue('--animation-speed-multiplier')).toBe('0.5')
    expect(root.style.getPropertyValue('--animation-duration')).toBe('0.15s')
    expect(root.style.getPropertyValue('--transition-duration')).toBe('0.1s')
  })

  it('sets normal animation speed multiplier', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, animation_speed: 'normal' },
    })

    renderHook(() => useMotionSettings())

    const root = document.documentElement
    expect(root.style.getPropertyValue('--animation-speed-multiplier')).toBe('1')
    expect(root.style.getPropertyValue('--animation-duration')).toBe('0.3s')
    expect(root.style.getPropertyValue('--transition-duration')).toBe('0.2s')
  })

  it('cleans up classes and styles on unmount', () => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, reduce_motion: true },
    })

    const { unmount } = renderHook(() => useMotionSettings())

    const root = document.documentElement
    expect(root.classList.contains('reduce-motion')).toBe(true)

    unmount()

    expect(root.classList.contains('reduce-motion')).toBe(false)
    expect(root.classList.contains('no-transitions')).toBe(false)
    expect(root.classList.contains('no-hover-effects')).toBe(false)
    expect(root.style.getPropertyValue('--animation-duration')).toBe('')
    expect(root.style.getPropertyValue('--transition-duration')).toBe('')
    expect(root.style.getPropertyValue('--animation-speed-multiplier')).toBe('')
  })
})

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } }

/** True on macOS and iOS, where the primary shortcut modifier is ⌘ instead of Ctrl. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as NavigatorWithUAData
  const platform = nav.userAgentData?.platform || nav.platform || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** Label for the primary modifier key on this platform: "⌘" or "Ctrl". */
export function modifierKeyLabel(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl'
}

/**
 * Read whether OS-login autostart is currently enabled.
 * Dynamic import keeps the plugin out of non-desktop bundles.
 */
export async function getAutostartEnabled(): Promise<boolean> {
  const { isEnabled } = await import('@tauri-apps/plugin-autostart')
  return isEnabled()
}

/**
 * Mutation only — enables or disables OS-login autostart without a verification read.
 * The caller reconciles actual OS state via {@link getAutostartEnabled} after every
 * mutation outcome so a verification failure surfaces as unknown rather than a
 * stale or assumed value.
 */
export async function mutateAutostartEnabled(enabled: boolean): Promise<void> {
  const { disable, enable } = await import('@tauri-apps/plugin-autostart')
  if (enabled) await enable()
  else await disable()
}

import { describe, expect, it } from 'vitest'
import capability from '../../../src-tauri/capabilities/default.json'

describe('desktop renderer capabilities', () => {
  it('grants only the permissions required by the main window', () => {
    expect(capability.windows).toEqual(['main'])
    expect(capability.permissions).toEqual([
      'core:default',
      'notification:default',
      'notification:allow-is-permission-granted',
      'notification:allow-request-permission',
      'notification:allow-notify',
      'fs:allow-write-text-file',
      'dialog:default',
      'process:default',
      'updater:default',
      'autostart:allow-enable',
      'autostart:allow-disable',
      'autostart:allow-is-enabled',
      'core:window:allow-show',
      'core:window:allow-hide',
      'core:window:allow-close',
      'core:window:allow-minimize',
      'core:window:allow-toggle-maximize',
      'core:window:allow-start-dragging',
      'core:window:allow-set-focus',
      'core:window:allow-unminimize',
    ])
  })
})

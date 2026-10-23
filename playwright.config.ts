import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const devPort = process.env.KESSAI_DEV_PORT ?? '1420'
const apiPort = process.env.KESSAI_API_PORT ?? '3000'
// The web backend must never run against the real user database during tests.
const e2eDbPath = join(mkdtempSync(join(tmpdir(), 'kessai-e2e-')), 'kessai-e2e.db')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: `http://localhost:${devPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: '**/web-*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'real-web',
      testMatch: ['**/web-smoke.spec.ts', '**/web-mutations.spec.ts'],
      // A full-backup restore replaces the shared backend database.
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'pnpm dev',
      url: `http://localhost:${devPort}`,
      name: 'Frontend',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: `cargo run -p kessai-web -- --dist-dir dist --port ${apiPort}`,
      url: `http://localhost:${apiPort}/api/settings`,
      name: 'Web backend',
      reuseExistingServer: false,
      timeout: 300000,
      env: { KESSAI_DB_PATH: e2eDbPath },
    },
  ],
})

import { defineConfig, devices } from '@playwright/test'

const smokeBaseUrl = `http://127.0.0.1:${process.env.KESSAI_API_PORT ?? '3001'}`

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/web-smoke.spec.ts', '**/web-mutations.spec.ts'],
  // Restore replaces all backend data, so real-web journeys must not overlap.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: smokeBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'node scripts/run-web-smoke.js',
    url: smokeBaseUrl,
    reuseExistingServer: false,
    timeout: 180000,
  },
})

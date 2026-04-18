import { defineConfig, devices } from '@playwright/test'

const smokeBaseUrl = 'http://127.0.0.1:3001'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
    command: 'pnpm serve:smoke',
    url: smokeBaseUrl,
    reuseExistingServer: false,
    timeout: 180000,
  },
})

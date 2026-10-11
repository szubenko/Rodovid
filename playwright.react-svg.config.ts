import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/react-svg',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4176', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build:react-svg && npm run preview:react-svg -- --port 4176',
    url: 'http://127.0.0.1:4176', reuseExistingServer: false, timeout: 120_000,
  },
})

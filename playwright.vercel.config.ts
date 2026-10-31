import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/deployment',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4180', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  // Requires npm run build:vercel first; checks local browser compatibility.
  webServer: {
    command: 'npx --no-install vite preview --config vite.vercel-preview.config.ts',
    url: 'http://127.0.0.1:4180', reuseExistingServer: false, timeout: 30_000,
  },
})

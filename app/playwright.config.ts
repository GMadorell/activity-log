import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { ...devices['Pixel 7'], baseURL: 'http://localhost:5174/activity-log/' },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174/activity-log/',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_GITHUB_CLIENT_ID: 'Iv1.test',
      VITE_AUTH_URL: 'https://auth.test',
      VITE_DATA_REPO: 'me/data',
    },
  },
})

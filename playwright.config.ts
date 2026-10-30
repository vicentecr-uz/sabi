import { defineConfig, devices } from '@playwright/test';

const slowMo = Number(process.env.SLOWMO ?? 0);

export default defineConfig({
  testDir: 'tests',
  // Watching slowed-down tests takes far longer than the default 30s per test.
  timeout: slowMo ? 600_000 : undefined,
  use: { baseURL: 'http://localhost:4173', launchOptions: { slowMo } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'bun run build && bun fixtures/serve.ts',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});

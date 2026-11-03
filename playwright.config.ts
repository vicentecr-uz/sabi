import { defineConfig, devices } from '@playwright/test';

const slowMo = Number(process.env.SLOWMO ?? 0);
const port = Number(process.env.SABI_FIXTURE_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests',
  // Watching slowed-down tests takes far longer than the default 30s per test.
  timeout: slowMo ? 600_000 : undefined,
  use: { baseURL: `http://localhost:${port}`, launchOptions: { slowMo, chromiumSandbox: true } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'bun run build && bun fixtures/serve.ts',
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});

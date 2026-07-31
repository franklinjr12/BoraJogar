import { defineConfig, devices } from '@playwright/test';

const apiPort = Number(process.env.E2E_API_PORT ?? 18080);
const webPort = Number(process.env.E2E_WEB_PORT ?? 4173);
const apiURL = `http://127.0.0.1:${apiPort}`;
const webURL = `http://127.0.0.1:${webPort}`;
const databaseURL =
  process.env.E2E_DATABASE_URL ??
  'postgres://borajogar:borajogar@localhost:5432/borajogar_e2e?sslmode=disable';
const sessionSecret = process.env.E2E_SESSION_SECRET ?? 'e2e-session-secret-12345678901234567890';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      name: 'api',
      command: 'go -C ../api run ./cmd/server',
      url: `${apiURL}/health/ready`,
      env: {
        ...process.env,
        APP_ENV: 'e2e',
        APP_PORT: String(apiPort),
        APP_BASE_URL: webURL,
        DATABASE_URL: databaseURL,
        SESSION_SECRET: sessionSecret,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      name: 'web',
      command: `npm run dev -- --host 127.0.0.1 --port ${webPort}`,
      url: webURL,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: apiURL,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
});

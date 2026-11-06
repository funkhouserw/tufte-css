// QA suite for the Tufte kit. Always rebuilds dist/ and serves it on its own port, so a
// stale `npm run preview` on 5181 can never make these tests pass against old output.
import { defineConfig, devices } from '@playwright/test'

const PORT = 5182

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // More than this starves Firefox, whose launches then time out.
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], deviceScaleFactor: 1 } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `node scripts/build.mjs && npx vite preview --outDir dist --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/plain/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
  },
})

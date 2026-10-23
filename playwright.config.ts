import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:18799',
    viewport: { width: 1280, height: 800 },
    channel: 'chrome',
    launchOptions: { args: ['--no-sandbox', '--use-gl=angle', '--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'zsh scripts/e2e-daemon.sh',
    url: 'http://127.0.0.1:18799/health',
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

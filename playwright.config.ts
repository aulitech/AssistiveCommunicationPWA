// The browser tests — see *Testing* in AGENTS.md.
//
// **What jsdom cannot see.** It lays nothing out, so every claim about where
// something is, how big, or what a real browser does to a text box is out of its
// reach — and the suite said so, in seven places, rather than testing it. These
// run the production build in Chromium and hold those claims. Each one was a
// check made by hand against a preview at least once before it was written here.

import { defineConfig, devices } from '@playwright/test'

const PORT = 4317

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // **No retries.** A test that passes the second time is a test that fails
  // sometimes, and this suite exists to notice what the other one cannot.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  // The production build, as it ships: the service worker, the windowed grid
  // and the bundle's own CSS are all part of what is being checked.
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})

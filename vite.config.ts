// Vite config — https://vitejs.dev/config/
//
// The test block lives here rather than in a separate vitest.config.ts. That
// file existed only because Figma Make regenerated this one and would have
// overwritten anything added to it; nothing regenerates it now.

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

/**
 * The version, out of `package.json` — the one place it is written, and bumped
 * with every merge to main (see AGENTS.md). Built into the bundle rather than
 * fetched, so the menu can say which release is running on a device that is
 * offline, which is when somebody is most likely to be asked.
 */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Every test lives under `tests/`, mirroring the tree it covers. Not a
    // matter of taste: `netlify/functions/` is a directory where **every file
    // becomes a deployed function**, so a test sitting beside the code it
    // covered was published as one and took the deploy down with it. Keeping
    // them all in one place is the rule that has no exception to forget.
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // Vite loads .env.local during tests too, so without this the suite would
    // depend on whether the developer happens to have configured OAuth — green
    // on CI, red on their machine. Tests that care stub these themselves.
    env: {
      VITE_GOOGLE_CLIENT_ID: '',
      VITE_APPLE_CLIENT_ID: '',
      VITE_FACEBOOK_APP_ID: '',
    },
  },
})

// Vite config — https://vitejs.dev/config/
//
// The test block lives here rather than in a separate vitest.config.ts. That
// file existed only because Figma Make regenerated this one and would have
// overwritten anything added to it; nothing regenerates it now.

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The function under `netlify/` is tested too. It is the one piece of this
    // app that runs anywhere but the user's own device, so leaving it outside
    // the suite would put the only exposed surface beyond the one gate — see
    // `netlify.toml`, where the build is `pnpm check && pnpm build`.
    include: ['src/**/*.test.{ts,tsx}', 'netlify/**/*.test.{ts,tsx}'],
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

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth client ID, ending in .apps.googleusercontent.com */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** Apple Services ID, e.g. tech.auli.peri.signin */
  readonly VITE_APPLE_CLIENT_ID?: string
  /** Meta app ID (numeric) */
  readonly VITE_FACEBOOK_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

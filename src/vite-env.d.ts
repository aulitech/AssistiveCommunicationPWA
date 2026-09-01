/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth client ID, ending in .apps.googleusercontent.com */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** Apple Services ID, e.g. tech.auli.peri.signin */
  readonly VITE_APPLE_CLIENT_ID?: string
  /** Meta app ID (numeric) */
  readonly VITE_FACEBOOK_APP_ID?: string
  /**
   * Google Cloud Translation key. Restricted by HTTP referrer to this site and
   * to Cloud Translation alone, which is what makes it safe to inline — see
   * `.env.example`. Absent means translation is off and Peri speaks the phrases
   * it ships translations for and nothing else.
   */
  readonly VITE_GOOGLE_TRANSLATE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

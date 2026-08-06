// OAuth client IDs — set these in .env.local:
//   VITE_GOOGLE_CLIENT_ID=...
//   VITE_APPLE_CLIENT_ID=...   (your Services ID, e.g. com.yourapp.signin)
//   VITE_FACEBOOK_APP_ID=...

export interface OAuthUser {
  name: string
  email: string
  avatar?: string
  provider: 'google' | 'apple' | 'facebook'
  sub: string         // provider-scoped user ID
  accessToken?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeJwt(token: string): Record<string, string> {
  try {
    let payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    payload += '='.repeat((4 - (payload.length % 4)) % 4)
    // atob yields bytes, not characters — decode as UTF-8 so non-ASCII names
    // ("José", "О́льга") survive instead of arriving as mojibake.
    const bytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('Invalid JWT')
  }
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return }
    const s = document.createElement('script')
    s.id = id; s.src = src; s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

// ── Google (Identity Services) ────────────────────────────────────────────────
// Uses the GIS popup / One Tap flow. Returns an ID token JWT with name, email,
// picture, and sub. No redirect URI needed for the popup flow.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string
            callback: (r: { credential: string }) => void
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
          }): void
          prompt(callback?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void
          renderButton(el: HTMLElement, config: object): void
          cancel(): void
        }
      }
    }
  }
}

export async function signInWithGoogle(): Promise<OAuthUser> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set')

  await loadScript('https://accounts.google.com/gsi/client', 'gsi-client')

  return new Promise((resolve, reject) => {
    window.google!.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => {
        try {
          const claims = decodeJwt(credential)
          resolve({
            provider: 'google',
            sub:      claims.sub,
            name:     claims.name,
            email:    claims.email,
            avatar:   claims.picture,
            accessToken: credential,
          })
        } catch (e) {
          reject(e)
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    window.google!.accounts.id.prompt(notification => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        reject(new Error('Google sign-in was dismissed or blocked'))
      }
    })
  })
}

// ── Apple (Sign in with Apple JS) ─────────────────────────────────────────────
// Popup mode — requires a registered Services ID and the current origin added
// as a redirect URI in the Apple Developer console.

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init(config: {
          clientId: string
          scope: string
          redirectURI: string
          usePopup: boolean
        }): void
        signIn(): Promise<{
          authorization: { id_token: string; code: string }
          user?: { name?: { firstName?: string; lastName?: string }; email?: string }
        }>
      }
    }
  }
}

export async function signInWithApple(): Promise<OAuthUser> {
  const clientId = import.meta.env.VITE_APPLE_CLIENT_ID
  if (!clientId) throw new Error('VITE_APPLE_CLIENT_ID is not set')

  await loadScript(
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
    'apple-auth'
  )

  window.AppleID!.auth.init({
    clientId,
    scope: 'name email',
    redirectURI: window.location.origin,
    usePopup: true,
  })

  const response = await window.AppleID!.auth.signIn()
  const claims = decodeJwt(response.authorization.id_token)

  // Apple only sends user.name on the FIRST sign-in; cache it locally
  const storedName = localStorage.getItem('apple_user_name')
  const firstName  = response.user?.name?.firstName ?? ''
  const lastName   = response.user?.name?.lastName  ?? ''
  const name       = (firstName + ' ' + lastName).trim() || storedName || claims.email || 'Apple User'
  if (firstName || lastName) localStorage.setItem('apple_user_name', name)

  return {
    provider: 'apple',
    sub:      claims.sub,
    name,
    email:    response.user?.email ?? claims.email ?? '',
    accessToken: response.authorization.code,
  }
}

// ── Facebook (JS SDK) ─────────────────────────────────────────────────────────

declare global {
  interface Window {
    FB?: {
      init(config: { appId: string; version: string; cookie: boolean; xfbml: boolean }): void
      login(cb: (r: { authResponse?: { accessToken: string } }) => void, opts: { scope: string }): void
      api(path: string, params: object, cb: (data: Record<string, string>) => void): void
    }
    fbAsyncInit?: () => void
  }
}

export async function signInWithFacebook(): Promise<OAuthUser> {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID
  if (!appId) throw new Error('VITE_FACEBOOK_APP_ID is not set')

  await new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, version: 'v19.0', cookie: true, xfbml: false })
      resolve()
    }
    loadScript('https://connect.facebook.net/en_US/sdk.js', 'fb-sdk').catch(reject)
  })

  const authResponse = await new Promise<{ accessToken: string }>((resolve, reject) => {
    window.FB!.login(r => {
      if (r.authResponse) resolve(r.authResponse)
      else reject(new Error('Facebook login cancelled'))
    }, { scope: 'public_profile,email' })
  })

  const me = await new Promise<Record<string, string>>(resolve => {
    window.FB!.api('/me', { fields: 'id,name,email,picture.type(large)' }, resolve)
  })

  return {
    provider:    'facebook',
    sub:         me.id,
    name:        me.name,
    email:       me.email ?? '',
    avatar:      (me as unknown as { picture?: { data?: { url?: string } } }).picture?.data?.url,
    accessToken: authResponse.accessToken,
  }
}

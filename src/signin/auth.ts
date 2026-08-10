// Sign-in with Google, Apple and Facebook.
//
// Credentials come from environment variables — see .env.example and
// docs/oauth-setup.md. A provider with no credential is reported as
// unconfigured rather than offered and then failing.
//
// Scope note: there is no backend. Nothing here authenticates anyone to a
// server — it personalises this device with a name, email and picture, and the
// token is discarded once those are read. Do not treat a signed-in user as
// having proven anything.

export interface OAuthUser {
  name: string
  email: string
  avatar?: string
  provider: 'google' | 'apple' | 'facebook'
  sub: string // provider-scoped user ID
}

export type Provider = OAuthUser['provider']

/** Raised when the person closes the popup or declines. Not an error to report loudly. */
export class SignInCancelled extends Error {
  constructor(provider: Provider) {
    super(`${provider} sign-in was cancelled`)
    this.name = 'SignInCancelled'
  }
}

const CLIENT_IDS: Record<Provider, string | undefined> = {
  google: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  apple: import.meta.env.VITE_APPLE_CLIENT_ID,
  facebook: import.meta.env.VITE_FACEBOOK_APP_ID,
}

export function isConfigured(provider: Provider): boolean {
  return Boolean(CLIENT_IDS[provider]?.trim())
}

export function configuredProviders(): Provider[] {
  return (Object.keys(CLIENT_IDS) as Provider[]).filter(isConfigured)
}

function clientId(provider: Provider): string {
  const id = CLIENT_IDS[provider]?.trim()
  if (!id) {
    throw new Error(
      `${provider} sign-in is not configured. Set the matching VITE_… variable — see docs/oauth-setup.md.`,
    )
  }
  return id
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

// One promise per script. The previous version resolved as soon as a tag with
// the right id existed, so a second sign-in attempt during the first load
// continued with the SDK still undefined.
const scripts = new Map<string, Promise<void>>()

function loadScript(src: string, id: string): Promise<void> {
  const pending = scripts.get(id)
  if (pending) return pending

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing) {
      // Added outside this module; wait for it rather than assuming it is ready.
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)))
      return
    }
    const s = document.createElement('script')
    s.id = id
    s.src = src
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      scripts.delete(id) // allow a retry after a network failure
      reject(new Error(`Failed to load ${src}`))
    }
    document.head.appendChild(s)
  })

  scripts.set(id, promise)
  return promise
}

// ── Google ────────────────────────────────────────────────────────────────────
// Uses the OAuth token flow rather than One Tap. One Tap needs Google's own
// rendered button and is suppressed outright in browsers without third-party
// cookies, which would leave a dwell user staring at a button that does nothing.

interface TokenResponse {
  access_token?: string
  error?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type?: string; message?: string }) => void
          }): { requestAccessToken(): void }
        }
      }
    }
  }
}

export async function signInWithGoogle(): Promise<OAuthUser> {
  const id = clientId('google')
  await loadScript('https://accounts.google.com/gsi/client', 'gsi-client')
  if (!window.google?.accounts?.oauth2) throw new Error('Google sign-in failed to load')

  const token = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: 'openid email profile',
      callback: response => {
        if (response.access_token) resolve(response.access_token)
        else reject(new SignInCancelled('google'))
      },
      error_callback: () => reject(new SignInCancelled('google')),
    })
    client.requestAccessToken()
  })

  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not read your Google profile')
  const claims = (await res.json()) as Record<string, string>

  return {
    provider: 'google',
    sub: claims.sub,
    name: claims.name || claims.email || 'Google user',
    email: claims.email ?? '',
    avatar: claims.picture,
  }
}

// ── Apple ─────────────────────────────────────────────────────────────────────
// Popup mode. Needs a Services ID whose Return URL is exactly this origin.

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init(config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void
        signIn(): Promise<{
          authorization: { id_token: string; code: string }
          user?: { name?: { firstName?: string; lastName?: string }; email?: string }
        }>
      }
    }
  }
}

const APPLE_NAME_KEY = 'apple_user_name'

export async function signInWithApple(): Promise<OAuthUser> {
  const id = clientId('apple')
  await loadScript(
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
    'apple-auth',
  )
  if (!window.AppleID) throw new Error('Apple sign-in failed to load')

  window.AppleID.auth.init({
    clientId: id,
    scope: 'name email',
    redirectURI: window.location.origin,
    usePopup: true,
  })

  let response
  try {
    response = await window.AppleID.auth.signIn()
  } catch (err) {
    const code = (err as { error?: string })?.error
    if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') {
      throw new SignInCancelled('apple')
    }
    throw new Error('Apple sign-in failed. Check that this site is listed as a Return URL.', { cause: err })
  }

  const claims = decodeJwt(response.authorization.id_token)

  // Apple sends the name only on the very first authorisation, so keep it.
  const first = response.user?.name?.firstName ?? ''
  const last = response.user?.name?.lastName ?? ''
  const fresh = `${first} ${last}`.trim()
  if (fresh) localStorage.setItem(APPLE_NAME_KEY, fresh)
  const name = fresh || localStorage.getItem(APPLE_NAME_KEY) || claims.email || 'Apple user'

  return {
    provider: 'apple',
    sub: claims.sub,
    name,
    email: response.user?.email ?? claims.email ?? '',
  }
}

// ── Facebook ──────────────────────────────────────────────────────────────────

interface FacebookAuth {
  accessToken: string
}

declare global {
  interface Window {
    FB?: {
      init(config: { appId: string; version: string; cookie: boolean; xfbml: boolean }): void
      login(cb: (r: { status?: string; authResponse?: FacebookAuth }) => void, opts: { scope: string }): void
      api(path: string, params: object, cb: (data: Record<string, string> | { error: unknown }) => void): void
    }
    fbAsyncInit?: () => void
  }
}

const FACEBOOK_VERSION = 'v21.0'

async function loadFacebookSdk(appId: string): Promise<NonNullable<Window['FB']>> {
  // If the SDK is already up, do not wait on fbAsyncInit — it fires once per
  // page load, so waiting on it a second time hangs forever.
  if (window.FB) return window.FB

  const ready = new Promise<void>(resolve => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, version: FACEBOOK_VERSION, cookie: true, xfbml: false })
      resolve()
    }
  })

  await loadScript('https://connect.facebook.net/en_US/sdk.js', 'fb-sdk')
  await ready
  if (!window.FB) throw new Error('Facebook sign-in failed to load')
  return window.FB
}

export async function signInWithFacebook(): Promise<OAuthUser> {
  const appId = clientId('facebook')
  const FB = await loadFacebookSdk(appId)

  const auth = await new Promise<FacebookAuth>((resolve, reject) => {
    FB.login(
      response => {
        if (response.authResponse) resolve(response.authResponse)
        else reject(new SignInCancelled('facebook'))
      },
      { scope: 'public_profile,email' },
    )
  })

  const me = await new Promise<Record<string, string>>((resolve, reject) => {
    FB.api('/me', { fields: 'id,name,email,picture.type(large)', access_token: auth.accessToken }, data => {
      if (data && 'error' in data) reject(new Error('Could not read your Facebook profile'))
      else resolve(data as Record<string, string>)
    })
  })

  return {
    provider: 'facebook',
    sub: me.id,
    name: me.name || 'Facebook user',
    // Facebook only returns an email if the account has a confirmed one and the
    // person granted the permission; both are commonly missing.
    email: me.email ?? '',
    avatar: (me as unknown as { picture?: { data?: { url?: string } } }).picture?.data?.url,
  }
}

export const SIGN_IN: Record<Provider, () => Promise<OAuthUser>> = {
  google: signInWithGoogle,
  apple: signInWithApple,
  facebook: signInWithFacebook,
}

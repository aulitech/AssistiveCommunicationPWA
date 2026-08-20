import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The module reads import.meta.env at import time, so each configuration needs
// a fresh import with the environment already stubbed.
async function loadAuth(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string)
  return import('../../src/signin/auth')
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  document.querySelectorAll('script').forEach(s => s.remove())
})

describe('configuration', () => {
  it('reports nothing configured when no variables are set', async () => {
    const auth = await loadAuth({
      VITE_GOOGLE_CLIENT_ID: '',
      VITE_APPLE_CLIENT_ID: '',
      VITE_FACEBOOK_APP_ID: '',
    })
    expect(auth.configuredProviders()).toEqual([])
    expect(auth.isConfigured('google')).toBe(false)
  })

  it('reports only the providers that have a credential', async () => {
    const auth = await loadAuth({
      VITE_GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com',
      VITE_APPLE_CLIENT_ID: '',
      VITE_FACEBOOK_APP_ID: '123456',
    })
    expect(auth.configuredProviders()).toEqual(['google', 'facebook'])
  })

  it('treats a whitespace-only value as unset', async () => {
    const auth = await loadAuth({ VITE_GOOGLE_CLIENT_ID: '   ' })
    expect(auth.isConfigured('google')).toBe(false)
  })

  it('explains itself when an unconfigured provider is used anyway', async () => {
    const auth = await loadAuth({ VITE_GOOGLE_CLIENT_ID: '' })
    await expect(auth.signInWithGoogle()).rejects.toThrow(/not configured/i)
  })
})

describe('SignInCancelled', () => {
  it('is distinguishable from a real failure', async () => {
    const auth = await loadAuth({})
    const cancelled = new auth.SignInCancelled('google')
    expect(cancelled).toBeInstanceOf(Error)
    expect(cancelled.name).toBe('SignInCancelled')
  })
})

describe('Google', () => {
  const stubGis = (behaviour: 'ok' | 'cancel' | 'error') => {
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            callback: (r: { access_token?: string }) => void
            error_callback?: (e: object) => void
          }) => ({
            requestAccessToken: () => {
              if (behaviour === 'ok') config.callback({ access_token: 'tok' })
              else if (behaviour === 'cancel') config.callback({})
              else config.error_callback?.({ type: 'popup_closed' })
            },
          }),
        },
      },
    })
  }

  // jsdom does not run scripts, so resolve the loader by firing load ourselves.
  const autoLoadScripts = () => {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLScriptElement) node.dispatchEvent(new Event('load'))
        }
      }
    })
    observer.observe(document.head, { childList: true })
    return () => observer.disconnect()
  }

  it('returns a profile from the token flow', async () => {
    const stop = autoLoadScripts()
    stubGis('ok')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ sub: '42', name: 'Ada Lovelace', email: 'ada@example.com', picture: 'p.png' }),
      })),
    )

    const auth = await loadAuth({ VITE_GOOGLE_CLIENT_ID: 'abc' })
    await expect(auth.signInWithGoogle()).resolves.toEqual({
      provider: 'google',
      sub: '42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: 'p.png',
    })
    stop()
  })

  it.each(['cancel', 'error'] as const)('treats %s as a cancellation, not a failure', async behaviour => {
    const stop = autoLoadScripts()
    stubGis(behaviour)
    const auth = await loadAuth({ VITE_GOOGLE_CLIENT_ID: 'abc' })
    await expect(auth.signInWithGoogle()).rejects.toThrow(/cancelled/i)
    stop()
  })

  it('reports a profile fetch that fails', async () => {
    const stop = autoLoadScripts()
    stubGis('ok')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    const auth = await loadAuth({ VITE_GOOGLE_CLIENT_ID: 'abc' })
    await expect(auth.signInWithGoogle()).rejects.toThrow(/profile/i)
    stop()
  })
})

describe('script loading', () => {
  // Regression guard: the loader used to resolve the moment a tag with the
  // right id existed, so a second attempt during the first load continued with
  // the SDK still undefined.
  it('waits for an in-flight load rather than resolving early', async () => {
    const auth = await loadAuth({ VITE_GOOGLE_CLIENT_ID: 'abc' })

    const first = auth.signInWithGoogle()
    const second = auth.signInWithGoogle()
    // Neither may settle while the script is still loading.
    const settled = await Promise.race([
      Promise.allSettled([first, second]).then(() => 'settled'),
      new Promise(r => setTimeout(() => r('still waiting'), 50)),
    ])
    expect(settled).toBe('still waiting')

    // Only one tag is added for the two attempts.
    expect(document.querySelectorAll('#gsi-client')).toHaveLength(1)

    document.getElementById('gsi-client')!.dispatchEvent(new Event('load'))
    await expect(first).rejects.toThrow()
    await expect(second).rejects.toThrow()
  })
})

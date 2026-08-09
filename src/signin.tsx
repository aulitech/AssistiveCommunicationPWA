
// The way in. Reached before anything else, so it carries its own dwell-time
// control: anyone who needs a slow dwell has to be able to set one before they
// can sign in at all.

import { useCallback, useMemo, useState } from 'react'
import { SIGN_IN, SignInCancelled, configuredProviders, type Provider } from './auth'
import { useSettings } from './settings'
import { type User } from './store'
import { AppLogoIcon, AppleIcon, FacebookIcon, GoogleIcon } from './icons'
import { DwellButton, DwellCursor, ScrollPane, SettingSpinner } from './ui'

const FEATURES = [
  { icon: '👁️', title: 'Dwell selection', body: 'No tapping or clicking — hover and hold to choose.' },
  { icon: '🔊', title: 'Instant speech', body: 'Selected phrases are spoken aloud immediately.' },
  { icon: '📱', title: 'Works offline', body: 'Install it and it keeps working with no network.' },
  { icon: '🔒', title: 'Stays on your device', body: 'Your phrases and settings are stored locally, never uploaded.' },
]

const PROVIDER_LABELS: Record<Provider, string> = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
}

export function SignInPage({ onSignIn }: { onSignIn: (user: User) => void }) {
  const { settings, update } = useSettings()
  const providers = useMemo(() => configuredProviders(), [])
  const [loading, setLoading] = useState<User['provider'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleOAuth = useCallback(
    async (provider: User['provider']) => {
      if (provider === 'guest') {
        onSignIn({ name: 'Guest', email: '', provider: 'guest' })
        return
      }
      setError(null)
      setLoading(provider)
      try {
        const oauthUser = await SIGN_IN[provider]()
        onSignIn({
          name: oauthUser.name,
          email: oauthUser.email,
          provider: oauthUser.provider,
          avatar: oauthUser.avatar,
        })
      } catch (err) {
        // Closing the popup is a decision, not a failure — say nothing.
        if (!(err instanceof SignInCancelled)) {
          setError(err instanceof Error ? err.message : 'Sign-in failed')
        }
        setLoading(null)
      }
    },
    [onSignIn],
  )

  const dwellMs = settings.actionDwellMs

  return (
    <div className="signin-page">
      {/* The page is laid out to fit without scrolling wherever it can — see
          the height tiers in the stylesheet — but a short landscape phone with
          three providers on offer will still overflow. When it does, the arrows
          are the only way down: a dwell user has no wheel and no scrollbar. */}
      <ScrollPane paneClassName="signin-content" step={120}>
        <div className="signin-brand">
          <div className="signin-logo"><AppLogoIcon /></div>
          <h1 className="signin-app-name">Peri</h1>
          <p className="signin-tagline">Assistive communication,<br />driven entirely by gaze and dwell.</p>
        </div>

        <div className="signin-features">
          {FEATURES.map(f => (
            <div key={f.title} className="signin-feature">
              <span className="signin-feature-icon" aria-hidden="true">{f.icon}</span>
              <div>
                <div className="signin-feature-title">{f.title}</div>
                <div className="signin-feature-body">{f.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="signin-actions">
          {loading ? (
            <div className="signin-loading">
              <div className="signin-spinner" />
              <span>Signing in with {loading.charAt(0).toUpperCase() + loading.slice(1)}…</span>
            </div>
          ) : (
            <>
              {error && (
                <div className="signin-error" role="alert">
                  <span aria-hidden="true">⚠</span> {error}
                </div>
              )}

              {/* Dwell time has to be adjustable before sign-in, or anyone who
                  needs a slow dwell cannot comfortably get into the app. */}
              <div className="signin-dwell">
                <span className="signin-dwell-label">Dwell time</span>
                <SettingSpinner
                  value={settings.actionDwellMs}
                  min={300}
                  max={2000}
                  step={100}
                  format={v => `${(v / 1000).toFixed(1)}s`}
                  onValue={v => update({ actionDwellMs: v })}
                />
              </div>

              {/* Only providers with credentials are offered. Showing a button
                  that can only fail is worse than not showing it at all. */}
              {providers.map(p => (
                <DwellButton
                  key={p}
                  className="auth-btn"
                  label={`Continue with ${PROVIDER_LABELS[p]}`}
                  onSelect={() => handleOAuth(p)}
                  durationMs={dwellMs}
                >
                  <div className="auth-btn-inner">
                    {p === 'google' && <GoogleIcon />}
                    {p === 'apple' && <AppleIcon />}
                    {p === 'facebook' && <FacebookIcon />}
                    <span>Continue with {PROVIDER_LABELS[p]}</span>
                    <div className="auth-dwell-bar" />
                  </div>
                </DwellButton>
              ))}

              {providers.length > 0 && <div className="signin-divider"><span>or</span></div>}

              <DwellButton className="auth-btn" label="Continue as guest" onSelect={() => handleOAuth('guest')} durationMs={dwellMs}>
                <div className="auth-btn-inner"><span className="auth-guest-icon" aria-hidden="true">👤</span><span>Continue as guest</span><div className="auth-dwell-bar" /></div>
              </DwellButton>

              <p className="signin-legal">
                By continuing you agree to our <a href="/terms">Terms of Service</a> and{' '}
                <a href="/privacy">Privacy Policy</a>. Signing in only personalises this device —
                your phrases and settings are saved locally either way, and are not uploaded anywhere.
              </p>
            </>
          )}
        </div>
      </ScrollPane>

      <DwellCursor />
    </div>
  )
}

import { useState, useRef, useCallback, useEffect, useMemo, createContext, useContext } from 'react'
import { signInWithGoogle, signInWithApple, signInWithFacebook } from './auth'
import phraseTable from './imports/phrasetable.json'

// ── Types ────────────────────────────────────────────────────────────────────

type Screen = 'signin' | 'app'
type Category = string

interface Phrase {
  id: string
  text: string
  category: Category
}

interface User {
  name: string
  email: string
  provider: 'google' | 'apple' | 'facebook' | 'guest'
  avatar?: string
  accessToken?: string
}

// ── Phrase bank (from phrasetable.json) ───────────────────────────────────────

const PHRASES: Phrase[] = (phraseTable.phrases as { txt: string; id: number; category: string }[])
  .filter(p => p.txt?.trim())
  .map((p, i) => ({ id: String(i), text: p.txt.trim().replace(/\[[^\]]*\]/g, '').replace(/\.{2,}/g, '').replace(/[.\s]+$/, '').trim(), category: p.category }))

// ── Phrase store (user edits persisted to localStorage) ───────────────────────

const PHRASE_STORE_KEY = 'dwellspeak_phrase_store'

interface PhraseStore {
  custom:    Phrase[]                 // user-added phrases
  overrides: Record<string, string>   // id → new text
  hidden:    string[]                 // ids removed by user
}

const emptyStore = (): PhraseStore => ({ custom: [], overrides: {}, hidden: [] })

function loadPhraseStore(): PhraseStore {
  try {
    const raw = JSON.parse(localStorage.getItem(PHRASE_STORE_KEY) ?? '{}')
    const base = emptyStore()
    return {
      custom:    Array.isArray(raw.custom)    ? raw.custom    : base.custom,
      overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : base.overrides,
      hidden:    Array.isArray(raw.hidden)    ? raw.hidden    : base.hidden,
    }
  } catch { return emptyStore() }
}

function savePhraseStore(s: PhraseStore) {
  localStorage.setItem(PHRASE_STORE_KEY, JSON.stringify(s))
}

// ── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'dwellspeak_settings'

interface Settings {
  phraseDwellMs: number
  actionDwellMs: number
  voiceURI: string   // empty = default
  volume: number     // 0–1
  rate: number       // 0.5–2
}

const DEFAULT_SETTINGS: Settings = {
  phraseDwellMs: 1500,
  actionDwellMs: 800,
  voiceURI: '',
  volume: 1,
  rate: 1,
}

function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') } }
  catch { return DEFAULT_SETTINGS }
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

const SettingsCtx = createContext<{ settings: Settings; update: (patch: Partial<Settings>) => void }>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
})

const useSettings = () => useContext(SettingsCtx)

// ── Icons ─────────────────────────────────────────────────────────────────────

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}

function SpeakIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.74 3.17.78 1.21-.24 2.37-.93 3.67-.84 1.56.12 2.73.72 3.5 1.9-3.22 1.94-2.45 6.06.56 7.34-.65 1.58-1.51 3.17-2.9 3.7zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function AppLogoIcon() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="56" height="56" rx="16" fill="var(--accent)" fillOpacity="0.12"/>
      <path d="M10 16C10 13.8 11.8 12 14 12H42C44.2 12 46 13.8 46 16V34C46 36.2 44.2 38 42 38H30L22 46V38H14C11.8 38 10 36.2 10 34V16Z" fill="var(--accent)" fillOpacity="0.2" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="20" cy="25" r="2.5" fill="var(--accent)"/>
      <circle cx="28" cy="25" r="2.5" fill="var(--accent)"/>
      <circle cx="36" cy="25" r="2.5" fill="var(--accent)"/>
    </svg>
  )
}

// ── useDwellRepeat hook ───────────────────────────────────────────────────────
// Fires onAction after initialMs, then repeats every repeatMs while pointer stays.

function useDwellRepeat(initialMs: number, repeatMs: number, onAction: () => void) {
  const [active, setActive] = useState(false)
  const initialRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction

  const start = useCallback(() => {
    if (initialRef.current) return
    setActive(true)
    initialRef.current = setTimeout(() => {
      onActionRef.current()
      repeatRef.current = setInterval(() => onActionRef.current(), repeatMs)
    }, initialMs)
  }, [initialMs, repeatMs])

  const cancel = useCallback(() => {
    if (initialRef.current) { clearTimeout(initialRef.current);  initialRef.current = null }
    if (repeatRef.current)  { clearInterval(repeatRef.current);  repeatRef.current  = null }
    setActive(false)
  }, [])

  useEffect(() => {
    const onOut = (e: PointerEvent) => {
      const exitedWindow = !e.relatedTarget || !(e.relatedTarget instanceof Node) || !document.contains(e.relatedTarget)
      if (exitedWindow) cancel()
    }
    window.addEventListener('pointerout', onOut, { passive: true })
    window.addEventListener('cancelAlldwells', cancel)
    return () => {
      window.removeEventListener('pointerout', onOut)
      window.removeEventListener('cancelAlldwells', cancel)
      cancel()
    }
  }, [cancel])

  return { active, start, cancel }
}

// ── useDwell hook ─────────────────────────────────────────────────────────────
// Refs keep start() stable so frequent re-renders don't stale-close the timer.

function useDwell(durationMs: number, onDwell: () => void, disabled = false) {
  const [active, setActive] = useState(false)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(onDwell)
  callbackRef.current = onDwell
  const durationRef = useRef(durationMs)
  durationRef.current = durationMs
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  const start = useCallback(() => {
    if (disabledRef.current || timerRef.current) return
    setActive(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setActive(false)
      callbackRef.current()
    }, durationRef.current)
  }, [])

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setActive(false)
  }, [])

  useEffect(() => {
    const onOut = (e: PointerEvent) => {
      const exitedWindow = !e.relatedTarget || !(e.relatedTarget instanceof Node) || !document.contains(e.relatedTarget)
      if (exitedWindow) cancel()
    }
    window.addEventListener('pointerout', onOut, { passive: true })
    window.addEventListener('cancelAlldwells', cancel)
    return () => {
      window.removeEventListener('pointerout', onOut)
      window.removeEventListener('cancelAlldwells', cancel)
      cancel()
    }
  }, [cancel])

  return { active, start, cancel }
}

// ── DwellButton ───────────────────────────────────────────────────────────────

function DwellButton({
  onSelect, children, className = '', label, disabled = false, durationMs = 800,
}: {
  onSelect: () => void
  children: React.ReactNode
  className?: string
  label: string
  disabled?: boolean
  durationMs?: number
}) {
  const [flash, setFlash] = useState(false)

  const handleDwell = useCallback(() => {
    if (disabled) return
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 320)
  }, [disabled, onSelect])

  const { active, start, cancel } = useDwell(durationMs, handleDwell, disabled)

  return (
    <div
      role="button"
      aria-label={label}
      className={[className, active ? 'dwelling' : '', flash ? 'flashed' : '', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-ms': `${durationMs}ms` } as React.CSSProperties}
      onPointerEnter={disabled ? undefined : start}
      onPointerLeave={cancel}
    >
      {children}
    </div>
  )
}

// ── DwellCursor ───────────────────────────────────────────────────────────────
// Isolated component — updates DOM directly, never re-renders the tree.

function DwellCursor() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (ref.current) {
        ref.current.style.left = `${e.clientX}px`
        ref.current.style.top  = `${e.clientY}px`
      }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  return (
    <div ref={ref} className="dwell-cursor" style={{ left: -100, top: -100 }}>
      <div className="dwell-cursor-dot" />
    </div>
  )
}

// ── PhraseCell ────────────────────────────────────────────────────────────────

function PhraseCell({ phrase, onSelect }: { phrase: Phrase; onSelect: (p: Phrase) => void }) {
  const { settings } = useSettings()
  const { editMode, openEdit } = useEdit()
  const [flash, setFlash] = useState(false)

  const handleDwell = useCallback(() => {
    if (editMode) { openEdit(phrase); return }
    onSelect(phrase)
    setFlash(true)
    setTimeout(() => setFlash(false), 350)
  }, [phrase, onSelect, editMode, openEdit])

  const { active, start, cancel } = useDwell(settings.phraseDwellMs, handleDwell)

  return (
    <div
      className={['phrase-cell', active ? 'dwelling' : '', flash ? 'selected' : '', editMode ? 'edit-mode' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${settings.phraseDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={start}
      onPointerLeave={cancel}
    >
      <span className="phrase-cell-text">{phrase.text}</span>
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

// ── ActionButton ──────────────────────────────────────────────────────────────

function ActionButton({ onSelect, className = '', children, label, disabled }: {
  onSelect: () => void; className?: string; children: React.ReactNode; label: string; disabled?: boolean
}) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)

  const handleDwell = useCallback(() => {
    if (disabled) return
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }, [disabled, onSelect])

  const { active, start, cancel } = useDwell(settings.actionDwellMs, handleDwell, !!disabled)

  return (
    <button
      className={['icon-btn', className, active ? 'dwelling' : '', flash ? 'selected' : '', disabled ? 'opacity-30' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={disabled ? undefined : start}
      onPointerLeave={cancel}
      aria-label={label}
      tabIndex={-1}
    >
      <div className="dwell-ring" />
      {children}
    </button>
  )
}

// ── SignInPage ────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '👁️', title: 'Dwell selection', body: 'No tapping or clicking — hover and hold to choose.' },
  { icon: '🔊', title: 'Instant speech', body: 'Selected phrases are spoken aloud immediately.' },
  { icon: '📱', title: 'Works offline', body: 'Installed as a PWA, available without a network.' },
  { icon: '☁️', title: 'Synced phrases', body: 'Sign in to back up and share your phrase library.' },
]

function SignInPage({ onSignIn }: { onSignIn: (user: User) => void }) {
  const [loading, setLoading] = useState<User['provider'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleOAuth = useCallback(async (provider: User['provider']) => {
    if (provider === 'guest') {
      onSignIn({ name: 'Guest', email: '', provider: 'guest' })
      return
    }
    setError(null)
    setLoading(provider)
    try {
      let oauthUser
      if (provider === 'google')   oauthUser = await signInWithGoogle()
      else if (provider === 'apple')    oauthUser = await signInWithApple()
      else                              oauthUser = await signInWithFacebook()
      onSignIn({
        name:     oauthUser.name,
        email:    oauthUser.email,
        provider: oauthUser.provider,
        avatar:   oauthUser.avatar,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setLoading(null)
    }
  }, [onSignIn])

  return (
    <div className="signin-page">
      <div className="signin-brand">
        <div className="signin-logo"><AppLogoIcon /></div>
        <h1 className="signin-app-name">DwellSpeak</h1>
        <p className="signin-tagline">Assistive communication,<br />driven entirely by gaze and dwell.</p>
      </div>

      <div className="signin-features">
        {FEATURES.map(f => (
          <div key={f.title} className="signin-feature">
            <span className="signin-feature-icon">{f.icon}</span>
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
              <div className="signin-error">
                <span>⚠</span> {error}
              </div>
            )}

            <DwellButton className="auth-btn" label="Continue with Google" onSelect={() => handleOAuth('google')} durationMs={1200}>
              <div className="auth-btn-inner"><GoogleIcon /><span>Continue with Google</span><div className="auth-dwell-bar" /></div>
            </DwellButton>

            <DwellButton className="auth-btn" label="Continue with Apple" onSelect={() => handleOAuth('apple')} durationMs={1200}>
              <div className="auth-btn-inner"><AppleIcon /><span>Continue with Apple</span><div className="auth-dwell-bar" /></div>
            </DwellButton>

            <DwellButton className="auth-btn" label="Continue with Facebook" onSelect={() => handleOAuth('facebook')} durationMs={1200}>
              <div className="auth-btn-inner"><FacebookIcon /><span>Continue with Facebook</span><div className="auth-dwell-bar" /></div>
            </DwellButton>

            <div className="signin-divider"><span>or</span></div>

            <DwellButton className="auth-btn" label="Continue as guest" onSelect={() => handleOAuth('guest')} durationMs={1200}>
              <div className="auth-btn-inner"><span className="auth-guest-icon">👤</span><span>Continue as guest</span><div className="auth-dwell-bar" /></div>
            </DwellButton>

            <p className="signin-legal">
              By continuing you agree to our Terms of Service and Privacy Policy.
              Your phrases and settings will not be saved without an account.
            </p>
          </>
        )}
      </div>

      <DwellCursor />
    </div>
  )
}

// ── TopPanel ──────────────────────────────────────────────────────────────────

function NavItem({ icon, label, sublabel, onSelect }: {
  icon: React.ReactNode; label: string; sublabel?: string; onSelect: () => void
}) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)
  const handleDwell = useCallback(() => { onSelect(); setFlash(true); setTimeout(() => setFlash(false), 320) }, [onSelect])
  const { active, start, cancel } = useDwell(settings.actionDwellMs, handleDwell)

  return (
    <div
      className={['nav-item', active ? 'dwelling' : '', flash ? 'flashed' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={start} onPointerLeave={cancel}
      role="button" aria-label={label}
    >
      <span className="nav-item-icon">{icon}</span>
      <div className="nav-item-text">
        <span className="nav-item-label">{label}</span>
        {sublabel && <span className="nav-item-sub">{sublabel}</span>}
      </div>
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

// ── SettingsPanel ─────────────────────────────────────────────────────────────

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function StepBtn({ onAction, children, label }: { onAction: () => void; children: React.ReactNode; label: string }) {
  const { settings } = useSettings()
  const dwell   = useDwellRepeat(settings.actionDwellMs, 200, onAction)
  return (
    <div
      className={['step-btn', dwell.active ? 'dwelling' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={dwell.start} onPointerLeave={dwell.cancel}
      onClick={onAction}
      role="button" aria-label={label}
    >
      <div className="dwell-bar" key={dwell.active ? 'a' : 'i'} />
      {children}
    </div>
  )
}

function SettingSpinner({
  value, min, max, step, format, onValue,
}: {
  value: number; min: number; max: number; step: number
  format: (v: number) => string
  onValue: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const dec = () => onValue(clamp(value - step))
  const inc = () => onValue(clamp(value + step))

  return (
    <div className="setting-spinner">
      <StepBtn onAction={dec} label="Decrease">−</StepBtn>
      <input
        className="setting-number"
        type="number"
        min={min} max={max} step={step}
        value={value}
        onChange={e => { const n = Number(e.target.value); if (!isNaN(n)) onValue(clamp(n)) }}
      />
      <span className="setting-formatted">{format(value)}</span>
      <StepBtn onAction={inc} label="Increase">+</StepBtn>
    </div>
  )
}

function VoiceDropdownItem({ name, selected, onSelect }: { name: string; selected: boolean; onSelect: () => void }) {
  const { settings } = useSettings()
  const { active, start, cancel } = useDwell(settings.actionDwellMs, onSelect)
  return (
    <div
      className={['voice-option', selected ? 'selected' : '', active ? 'dwelling' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={start} onPointerLeave={cancel}
      onClick={onSelect}
      role="option" aria-selected={selected}
    >
      {name}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function VoiceListScroller({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings()
  const listRef = useRef<HTMLDivElement>(null)
  const [canUp,   setCanUp]   = useState(false)
  const [canDown, setCanDown] = useState(false)

  const update = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setCanUp(el.scrollTop > 0)
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1)
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [update])

  const scrollBy = (dy: number) => listRef.current?.scrollBy({ top: dy, behavior: 'smooth' })

  const upOnce   = useDwell(settings.actionDwellMs, () => scrollBy(-80))
  const upRepeat = useDwellRepeat(settings.actionDwellMs, 180, () => scrollBy(-80))
  const dnOnce   = useDwell(settings.actionDwellMs, () => scrollBy(80))
  const dnRepeat = useDwellRepeat(settings.actionDwellMs, 180, () => scrollBy(80))

  return (
    <div className="voice-scroller">
      {canUp && (
        <div
          className={['voice-scroll-btn', upRepeat.active || upOnce.active ? 'dwelling' : ''].filter(Boolean).join(' ')}
          style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
          onPointerEnter={() => { upOnce.start(); upRepeat.start() }}
          onPointerLeave={() => { upOnce.cancel(); upRepeat.cancel() }}
          role="button" aria-label="Scroll up"
        >
          <div className="dwell-bar" key={(upRepeat.active || upOnce.active) ? 'a' : 'i'} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg>
        </div>
      )}
      <div ref={listRef} className="voice-list-inner">
        {children}
      </div>
      {canDown && (
        <div
          className={['voice-scroll-btn', dnRepeat.active || dnOnce.active ? 'dwelling' : ''].filter(Boolean).join(' ')}
          style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
          onPointerEnter={() => { dnOnce.start(); dnRepeat.start() }}
          onPointerLeave={() => { dnOnce.cancel(); dnRepeat.cancel() }}
          role="button" aria-label="Scroll down"
        >
          <div className="dwell-bar" key={(dnRepeat.active || dnOnce.active) ? 'a' : 'i'} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      )}
    </div>
  )
}

function VoiceRow({ voices }: { voices: SpeechSynthesisVoice[] }) {
  const { settings, update } = useSettings()
  const [open, setOpen] = useState(false)
  const items = [{ voiceURI: '', name: 'Default' }, ...voices]
  const current = items.find(v => v.voiceURI === settings.voiceURI) ?? items[0]

  const { active: btnActive, start: btnStart, cancel: btnCancel } = useDwell(
    settings.actionDwellMs,
    () => setOpen(o => !o)
  )

  return (
    <SettingRow label="Voice">
      <div className="voice-dropdown">
        <div
          className={['voice-trigger', btnActive ? 'dwelling' : ''].filter(Boolean).join(' ')}
          style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
          onPointerEnter={btnStart} onPointerLeave={btnCancel}
          onClick={() => setOpen(o => !o)}
          role="combobox" aria-expanded={open}
        >
          <span className="voice-trigger-label">{current.name}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <div className="dwell-bar" key={btnActive ? 'a' : 'i'} />
        </div>
        {open && (
          <div className="voice-list" role="listbox" onPointerLeave={() => setOpen(false)}>
            <VoiceListScroller>
              {items.map(v => (
                <VoiceDropdownItem
                  key={v.voiceURI}
                  name={v.name}
                  selected={v.voiceURI === settings.voiceURI}
                  onSelect={() => { update({ voiceURI: v.voiceURI }); setOpen(false) }}
                />
              ))}
            </VoiceListScroller>
          </div>
        )}
      </div>
    </SettingRow>
  )
}

function SettingsPanel() {
  const { settings, update } = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices().filter(v => v.lang.startsWith('en')))
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  return (
    <div className="settings-panel">
      <SettingRow label="Phrase dwell">
        <SettingSpinner value={settings.phraseDwellMs} min={500} max={3000} step={100}
          format={v => `${(v/1000).toFixed(1)}s`}
          onValue={v => update({ phraseDwellMs: v })} />
      </SettingRow>
      <SettingRow label="Action dwell">
        <SettingSpinner value={settings.actionDwellMs} min={300} max={2000} step={100}
          format={v => `${(v/1000).toFixed(1)}s`}
          onValue={v => update({ actionDwellMs: v })} />
      </SettingRow>
      <SettingRow label="Volume">
        <SettingSpinner value={Math.round(settings.volume * 100)} min={0} max={100} step={10}
          format={v => `${v}%`}
          onValue={v => update({ volume: v / 100 })} />
      </SettingRow>
      <SettingRow label="Speed">
        <SettingSpinner value={Math.round(settings.rate * 10)} min={5} max={20} step={1}
          format={v => `${(v/10).toFixed(1)}×`}
          onValue={v => update({ rate: v / 10 })} />
      </SettingRow>
      {voices.length > 0 && (
        <VoiceRow voices={voices} />
      )}
    </div>
  )
}

function TopPanel({ open, user, onClose, onSignOut }: {
  open: boolean; user: User; onClose: () => void; onSignOut: () => void
}) {
  const handleSignOut = useCallback(() => { onClose(); onSignOut() }, [onClose, onSignOut])
  const [showSettings, setShowSettings] = useState(false)

  // Reset settings view when panel closes
  useEffect(() => { if (!open) setShowSettings(false) }, [open])

  const scrimMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleScrimMove = useCallback(() => {
    if (scrimMoveTimer.current) return
    scrimMoveTimer.current = setTimeout(() => { scrimMoveTimer.current = null; onClose() }, 600)
  }, [onClose])
  const cancelScrimTimer = useCallback(() => {
    if (scrimMoveTimer.current) { clearTimeout(scrimMoveTimer.current); scrimMoveTimer.current = null }
  }, [])

  return (
    <>
      <div
        className={`panel-scrim ${open ? 'open' : ''}`}
        onPointerMove={handleScrimMove}
        onPointerLeave={cancelScrimTimer}
      />

      <div className={`top-panel ${open ? 'open' : ''}`} role="dialog" aria-label="Menu">
        {/* User row */}
        <div className="panel-user-row">
          <div className="panel-avatar">
            {user.provider === 'google'   && <span style={{ fontSize: 18 }}>G</span>}
            {user.provider === 'apple'    && <span style={{ fontSize: 18 }}></span>}
            {user.provider === 'facebook' && <span style={{ fontSize: 18 }}>f</span>}
            {user.provider === 'guest'    && <span style={{ fontSize: 18 }}>👤</span>}
          </div>
          <div className="panel-user-info">
            <span className="panel-user-name">{user.name}</span>
            {user.email && <span className="panel-user-email">{user.email}</span>}
          </div>
        </div>

        {showSettings ? (
          <>
            <SettingsPanel />
            <nav className="panel-nav">
              <NavItem
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>}
                label="Back"
                onSelect={() => setShowSettings(false)}
              />
            </nav>
          </>
        ) : (
          <nav className="panel-nav">
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
              label="Settings"
              sublabel="Dwell time, voice, volume, speed"
              onSelect={() => setShowSettings(true)}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
              label="Sign out"
              sublabel={user.email || 'Guest session'}
              onSelect={handleSignOut}
            />
          </nav>
        )}

        <div className="panel-handle" />
      </div>
    </>
  )
}

// ── Edit context ─────────────────────────────────────────────────────────────

interface EditCtxValue {
  editMode: boolean
  openEdit: (phrase: Phrase | null, isEmergency?: boolean) => void  // null = new phrase
}
const EditCtx = createContext<EditCtxValue>({ editMode: false, openEdit: () => {} })
const useEdit = () => useContext(EditCtx)

// ── EditModal ─────────────────────────────────────────────────────────────────

function EditModal({ phrase, isEmergency, allCategories, onSave, onDelete, onClose }: {
  phrase: Phrase | null
  isEmergency: boolean
  allCategories: string[]
  onSave: (text: string, category: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { settings } = useSettings()
  const [text, setText]       = useState(phrase?.text ?? '')
  const [category, setCategory] = useState(phrase?.category ?? allCategories[0] ?? '')
  const isNew = phrase === null

  const saveHook   = useDwell(settings.actionDwellMs, () => { if (text.trim()) onSave(text.trim(), category) })
  const deleteHook = useDwell(settings.actionDwellMs, onDelete)
  const closeHook  = useDwell(settings.actionDwellMs, onClose)

  return (
    <div className="edit-modal-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="edit-modal" role="dialog" aria-label={isNew ? 'Add phrase' : 'Edit phrase'}>
        <div className="edit-modal-title">{isNew ? 'Add phrase' : 'Edit phrase'}</div>

        <textarea
          className="edit-modal-text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Phrase text…"
          autoFocus
          rows={3}
        />

        {!isEmergency && (
          <div className="edit-modal-row">
            <label className="edit-modal-label">Category</label>
            <select
              className="edit-modal-select"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              {!allCategories.includes(category) && category && (
                <option value={category}>{category}</option>
              )}
            </select>
          </div>
        )}

        <div className="edit-modal-actions">
          {!isNew && (
            <div
              className={['edit-action-btn danger', deleteHook.active ? 'dwelling' : ''].filter(Boolean).join(' ')}
              style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
              onPointerEnter={deleteHook.start} onPointerLeave={deleteHook.cancel}
              onClick={onDelete} role="button"
            >
              <div className="dwell-bar" key={deleteHook.active ? 'a' : 'i'} />
              Delete
            </div>
          )}
          <div
            className={['edit-action-btn cancel', closeHook.active ? 'dwelling' : ''].filter(Boolean).join(' ')}
            style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
            onPointerEnter={closeHook.start} onPointerLeave={closeHook.cancel}
            onClick={onClose} role="button"
          >
            <div className="dwell-bar" key={closeHook.active ? 'a' : 'i'} />
            Cancel
          </div>
          <div
            className={['edit-action-btn save', saveHook.active ? 'dwelling' : '', !text.trim() ? 'is-disabled' : ''].filter(Boolean).join(' ')}
            style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
            onPointerEnter={text.trim() ? saveHook.start : undefined} onPointerLeave={saveHook.cancel}
            onClick={() => { if (text.trim()) onSave(text.trim(), category) }} role="button"
          >
            <div className="dwell-bar" key={saveHook.active ? 'a' : 'i'} />
            Save
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main app screen ───────────────────────────────────────────────────────────


const EMERGENCY_PHRASES: Phrase[] = [
  { id: 'em-0', text: 'Help me!',         category: 'Emergency' },
  { id: 'em-1', text: "I'm in pain",      category: 'Emergency' },
  { id: 'em-2', text: 'Call 911',         category: 'Emergency' },
  { id: 'em-3', text: 'Get a doctor',     category: 'Emergency' },
  { id: 'em-4', text: "I can't breathe",  category: 'Emergency' },
  { id: 'em-5', text: 'Call my family',   category: 'Emergency' },
]
const MAIN_PHRASES = PHRASES

const CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  ...[...new Set(MAIN_PHRASES.map(p => p.category))].sort().map(c => ({ id: c, label: c })),
]

function FilterTab({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)
  const handleDwell = useCallback(() => { onSelect(); setFlash(true); setTimeout(() => setFlash(false), 300) }, [onSelect])
  const { active: dwelling, start, cancel } = useDwell(settings.actionDwellMs, handleDwell, active)

  return (
    <div
      className={['filter-tab', active ? 'active' : '', dwelling ? 'dwelling' : '', flash ? 'flashed' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={active ? undefined : start}
      onPointerLeave={cancel}
      role="tab" aria-selected={active}
    >
      {label}
      <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
    </div>
  )
}

function FilterArrow({ onAction, repeat, label, children }: {
  onAction: () => void; repeat?: boolean; label: string; children: React.ReactNode
}) {
  const { settings } = useSettings()
  const once    = useDwell(settings.actionDwellMs, onAction)
  const repeats = useDwellRepeat(settings.actionDwellMs, 200, onAction)
  const hook    = repeat ? repeats : once
  return (
    <div
      className={['filter-arrow', hook.active ? 'dwelling' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={hook.start} onPointerLeave={hook.cancel}
      aria-label={label}
    >
      {children}
      <div className="dwell-bar" key={hook.active ? 'a' : 'i'} />
    </div>
  )
}

function FilterBar({ activeFilter, onSelect }: { activeFilter: string; onSelect: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollTo   = useCallback((pos: number) =>
    scrollRef.current?.scrollTo({ left: pos, behavior: 'smooth' }), [])
  const scrollBy   = useCallback((dx: number) =>
    scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' }), [])

  return (
    <div className="filter-bar-wrap" role="tablist" aria-label="Filter phrases by category">

      {/* ⏮ go to start */}
      <FilterArrow onAction={() => scrollTo(0)} label="Go to start">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="6" x2="5" y2="18"/><polyline points="19 18 11 12 19 6"/>
        </svg>
      </FilterArrow>

      {/* ‹ scroll left (auto-repeat) */}
      <FilterArrow onAction={() => scrollBy(-200)} repeat label="Scroll categories left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </FilterArrow>

      <div ref={scrollRef} className="filter-scroll">
        {CATEGORIES.map(c => (
          <FilterTab key={c.id} label={c.label} active={activeFilter === c.id} onSelect={() => onSelect(c.id)} />
        ))}
      </div>

      {/* › scroll right (auto-repeat) */}
      <FilterArrow onAction={() => scrollBy(200)} repeat label="Scroll categories right">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </FilterArrow>

      {/* ⏭ go to end */}
      <FilterArrow onAction={() => scrollTo(999999)} label="Go to end">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="6" x2="19" y2="18"/><polyline points="5 6 13 12 5 18"/>
        </svg>
      </FilterArrow>

    </div>
  )
}

// ── EmergencyBar ─────────────────────────────────────────────────────────────

const EMERGENCY_DWELL_MS = 1500

function EmergencyButton({ phrase }: { phrase: Phrase }) {
  const { editMode, openEdit } = useEdit()
  const [flash, setFlash] = useState(false)
  const handleDwell = useCallback(() => {
    if (editMode) { openEdit(phrase, true); return }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
      speechSynthesis.speak(new SpeechSynthesisUtterance(phrase.text))
    }
    setFlash(true)
    setTimeout(() => setFlash(false), 400)
  }, [phrase, editMode, openEdit])
  const { active, start, cancel } = useDwell(EMERGENCY_DWELL_MS, handleDwell)
  return (
    <div
      className={['emergency-btn', active ? 'dwelling' : '', flash ? 'flashed' : '', editMode ? 'edit-mode' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${EMERGENCY_DWELL_MS}ms` } as React.CSSProperties}
      onPointerEnter={start} onPointerLeave={cancel}
      role="button" aria-label={phrase.text} aria-live="assertive"
    >
      <span className="emergency-label">{phrase.text}</span>
      <div className="emergency-dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function EmergencyBar({ phrases = [] }: { phrases?: Phrase[] }) {
  if (!phrases || phrases.length === 0) return null
  return (
    <div className="emergency-bar">
      {phrases.map(p => (
        <EmergencyButton key={p.id} phrase={p} />
      ))}
    </div>
  )
}

// ── GridScrollBar ─────────────────────────────────────────────────────────────

const SCROLL_STEP = 120

function ScrollBtn({ onAction, repeat, label, children }: {
  onAction: () => void; repeat?: boolean; label: string; children: React.ReactNode
}) {
  const { settings } = useSettings()
  const dwellOnce   = useDwell(settings.actionDwellMs, onAction)
  const dwellRepeat = useDwellRepeat(settings.actionDwellMs, 180, onAction)
  const hook = repeat ? dwellRepeat : dwellOnce
  return (
    <div
      className={['scroll-btn', hook.active ? 'dwelling' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={hook.start} onPointerLeave={hook.cancel}
      role="button" aria-label={label}
    >
      <div className="scroll-btn-fill" key={hook.active ? 'a' : 'i'} />
      {children}
    </div>
  )
}

function GridScrollBar({ gridRef, editMode, onToggleEdit }: {
  gridRef: React.RefObject<HTMLElement | null>
  editMode: boolean
  onToggleEdit: () => void
}) {
  const { settings } = useSettings()
  const editHook = useDwell(settings.actionDwellMs, onToggleEdit)

  const scrollTo = useCallback((pos: number) =>
    gridRef.current?.scrollTo({ top: pos, behavior: 'smooth' }), [gridRef])
  const scrollBy = useCallback((dy: number) =>
    gridRef.current?.scrollBy({ top: dy, behavior: 'smooth' }), [gridRef])

  return (
    <div className="grid-scrollbar">
      {/* Edit toggle — always visible above scroll controls */}
      <div
        className={['scroll-btn edit-toggle-btn', editMode ? 'active' : '', editHook.active ? 'dwelling' : ''].filter(Boolean).join(' ')}
        style={{ '--dwell-duration': `${settings.actionDwellMs}ms` } as React.CSSProperties}
        onPointerEnter={editHook.start} onPointerLeave={editHook.cancel}
        onClick={onToggleEdit}
        role="button" aria-label={editMode ? 'Exit edit mode' : 'Edit phrases'}
        aria-pressed={editMode}
      >
        <div className="scroll-btn-fill" key={editHook.active ? 'a' : 'i'} />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </div>

      <ScrollBtn onAction={() => scrollTo(0)} label="Scroll to top">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="6" x2="19" y2="6"/><polyline points="8 14 12 10 16 14"/>
        </svg>
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollBy(-SCROLL_STEP)} repeat label="Scroll up">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollBy(SCROLL_STEP)} repeat label="Scroll down">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollTo(999999)} label="Scroll to bottom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="18" x2="19" y2="18"/><polyline points="8 10 12 14 16 10"/>
        </svg>
      </ScrollBtn>
    </div>
  )
}

function AACApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { settings } = useSettings()
  const [text, setText]           = useState('')
  const [history, setHistory]     = useState<string[]>([])
  const [menuOpen, setMenuOpen]   = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [cursorPos, setCursorPos] = useState(0)
  const [editMode, setEditMode]   = useState(false)
  const [store, setStore]         = useState<PhraseStore>(loadPhraseStore)
  const [editing, setEditing]     = useState<{ phrase: Phrase | null; isEmergency: boolean } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const showUndo = !text && history.length > 0

  const updateStore = useCallback((patch: Partial<PhraseStore>) => {
    setStore(s => { const next = { ...s, ...patch }; savePhraseStore(next); return next })
  }, [])

  // Effective phrase lists
  const mainPhrases = useMemo(() => {
    const overridden = MAIN_PHRASES
      .filter(p => !store.hidden.includes(p.id))
      .map(p => store.overrides[p.id] ? { ...p, text: store.overrides[p.id] } : p)
    return [...overridden, ...store.custom.filter(p => p.category !== 'Emergency')]
  }, [store])

  const emergencyPhrases = useMemo(() => {
    return EMERGENCY_PHRASES
      .map(p => store.overrides[p.id] ? { ...p, text: store.overrides[p.id] } : p)
      .filter(p => !store.hidden.includes(p.id))
      .concat(store.custom.filter(p => p.category === 'Emergency'))
  }, [store])

  const allCategories = useMemo(() =>
    [...new Set(mainPhrases.map(p => p.category))].sort(), [mainPhrases])

  const openEdit = useCallback((phrase: Phrase | null, isEmergency = false) => {
    setEditing({ phrase, isEmergency })
  }, [])

  const handleSave = useCallback((newText: string, newCategory: string) => {
    if (!editing) return
    const { phrase, isEmergency } = editing
    if (phrase === null) {
      // new phrase
      const id = `custom-${Date.now()}`
      const cat = isEmergency ? 'Emergency' : newCategory
      updateStore({ custom: [...store.custom, { id, text: newText, category: cat }] })
    } else {
      // edit existing — store as override
      updateStore({ overrides: { ...store.overrides, [phrase.id]: newText } })
    }
    setEditing(null)
  }, [editing, store, updateStore])

  const handleDelete = useCallback(() => {
    if (!editing?.phrase) return
    const id = editing.phrase.id
    if (id.startsWith('custom-')) {
      updateStore({ custom: store.custom.filter(p => p.id !== id) })
    } else {
      updateStore({ hidden: [...store.hidden, id] })
    }
    setEditing(null)
  }, [editing, store, updateStore])

  const editCtx: EditCtxValue = useMemo(() => ({
    editMode,
    openEdit,
  }), [editMode, openEdit])

  // Word immediately left of cursor
  const currentWord = useMemo(() => {
    const before = text.slice(0, cursorPos)
    return before.match(/\S+$/)?.[0] ?? ''
  }, [text, cursorPos])

  const visiblePhrases = useMemo(() => {
    const pool = activeFilter === 'all' ? mainPhrases : mainPhrases.filter(p => p.category === activeFilter)
    const q = currentWord.toLowerCase()
    if (!q) return pool

    const score = (phrase: string): number => {
      const p = phrase.toLowerCase()
      if (p.startsWith(q)) return 3
      const words = p.split(/\s+/)
      if (words.some(w => w.startsWith(q))) return 2
      let qi = 0
      for (const w of words) {
        if (qi < q.length && w[0] === q[qi]) qi++
      }
      if (qi === q.length) return 1
      return 0
    }

    return pool
      .map(p => ({ p, s: score(p.text) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.p)
  }, [activeFilter, currentWord])

  const trackCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPos(e.currentTarget.selectionStart ?? 0)
  }, [])

  // When a phrase is dwelled, replace the current word with the phrase text
  const handleSelectPhrase = useCallback((phrase: Phrase) => {
    const el = textareaRef.current
    const pos = el?.selectionStart ?? text.length
    const before = text.slice(0, pos)
    const after  = text.slice(pos)
    // strip the partial word left of cursor, then insert phrase
    const stripped = before.replace(/\S+$/, '')
    const separator = stripped.length > 0 && !stripped.endsWith(' ') ? ' ' : ''
    const newText = stripped + separator + phrase.text + (after.startsWith(' ') || after === '' ? '' : ' ') + after
    setHistory(h => [...h, text])
    setText(newText)
    // move cursor to end of inserted phrase
    const newPos = (stripped + separator + phrase.text).length
    setTimeout(() => {
      if (el) { el.selectionStart = el.selectionEnd = newPos }
      setCursorPos(newPos)
    }, 0)
  }, [text])

  const handleClearOrUndo = useCallback(() => {
    if (text) { setHistory(h => [...h, text]); setText('') }
    else if (history.length) { setText(history[history.length - 1]); setHistory(h => h.slice(0, -1)) }
  }, [text, history])

  const handleCopy = useCallback(() => {
    if (!text) return
    navigator.clipboard.writeText(text).catch(() => {})
  }, [text])

  const handleSpeak = useCallback(() => {
    if (!text || !('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.volume = settings.volume
    utt.rate   = settings.rate
    if (settings.voiceURI) {
      const voice = speechSynthesis.getVoices().find(v => v.voiceURI === settings.voiceURI)
      if (voice) utt.voice = voice
    }
    speechSynthesis.speak(utt)
  }, [text, settings])

  const toggleMenu  = useCallback(() => setMenuOpen(o => !o), [])
  const closeMenu   = useCallback(() => setMenuOpen(false), [])
  const gridRef     = useRef<HTMLElement>(null)

  return (
    <EditCtx.Provider value={editCtx}>
    <div className={['app', editMode ? 'edit-mode' : ''].filter(Boolean).join(' ')}>
      {/* ── Topbar ── */}
      <header className="topbar">
        <ActionButton label={menuOpen ? 'Close menu' : 'Open menu'} onSelect={toggleMenu} className="menu-btn">
          <MenuIcon />
        </ActionButton>

        <ActionButton
          className="left"
          onSelect={handleClearOrUndo}
          label={showUndo ? 'Undo' : 'Clear'}
          disabled={!text && !history.length}
        >
          {showUndo ? <UndoIcon /> : <ClearIcon />}
        </ActionButton>

        <textarea
          ref={textareaRef}
          className="text-display"
          aria-label="Composed message"
          value={text}
          onChange={e => { setText(e.target.value); trackCursor(e) }}
          onSelect={trackCursor}
          onClick={e => { trackCursor(e); if (editMode) openEdit(null) }}
          onKeyUp={trackCursor}
          placeholder={editMode ? 'Click to add a new phrase…' : 'Dwell on a phrase or type…'}
          rows={1}
          spellCheck
          autoCapitalize="sentences"
          readOnly={editMode}
        />

        <ActionButton className="right" onSelect={handleSpeak} label="Speak" disabled={!text}>
          <SpeakIcon />
        </ActionButton>

        <ActionButton className="right" onSelect={handleCopy} label="Copy to clipboard" disabled={!text}>
          <CopyIcon />
        </ActionButton>
      </header>

      {/* ── Filter bar — hidden while text search is active ── */}
      {!(currentWord && visiblePhrases.length > 0) && (
        <FilterBar activeFilter={activeFilter} onSelect={setActiveFilter} />
      )}

      {/* ── Phrase grid + scroll controls ── */}
      <div className="grid-area">
        <main ref={gridRef} className="grid-wrapper">
          <div className="phrase-grid" role="grid" aria-label="Phrase selection grid">
            {visiblePhrases.map(phrase => (
              <PhraseCell key={phrase.id} phrase={phrase} onSelect={handleSelectPhrase} />
            ))}
          </div>
        </main>
        <GridScrollBar gridRef={gridRef} editMode={editMode} onToggleEdit={() => setEditMode(m => !m)} />
      </div>

      {/* ── Emergency bar — always visible at bottom ── */}
      <EmergencyBar phrases={emergencyPhrases} />

      {/* ── Top panel ── */}
      <TopPanel open={menuOpen} user={user} onClose={closeMenu} onSignOut={onSignOut} />

      <DwellCursor />

      {/* ── Edit modal ── */}
      {editing !== null && (
        <EditModal
          phrase={editing.phrase}
          isEmergency={editing.isEmergency}
          allCategories={allCategories}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
    </EditCtx.Provider>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

const USER_KEY = 'dwellspeak_user'

function loadUser(): User | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') } catch { return null }
}

export default function App() {
  const [user, setUser]         = useState<User | null>(loadUser)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const screen: Screen = user ? 'app' : 'signin'

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(s => { const next = { ...s, ...patch }; saveSettings(next); return next })
  }, [])

  const handleSignIn = useCallback((u: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    setUser(u)
  }, [])

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  return (
    <SettingsCtx.Provider value={{ settings, update }}>
      {screen === 'signin'
        ? <SignInPage onSignIn={handleSignIn} />
        : <AACApp user={user!} onSignOut={handleSignOut} />}
    </SettingsCtx.Provider>
  )
}

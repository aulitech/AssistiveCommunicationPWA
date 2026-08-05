import { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type Category = 'response' | 'greet' | 'need' | 'feel' | 'request'

interface Phrase {
  id: string
  text: string
  category: Category
}

// ── Settings context ──────────────────────────────────────────────────────────

interface Settings {
  phraseDwellMs: number
  actionDwellMs: number
  voice: string
}

const ACTION_DWELL_DEFAULT = 800
const PHRASE_DWELL_DEFAULT = 1500

const SettingsCtx = createContext<{ settings: Settings; setSettings: (s: Settings) => void }>({
  settings: { phraseDwellMs: PHRASE_DWELL_DEFAULT, actionDwellMs: ACTION_DWELL_DEFAULT, voice: '' },
  setSettings: () => {},
})

// ── Phrase bank ──────────────────────────────────────────────────────────────

const PHRASES: Phrase[] = [
  { id: 'yes',        text: 'Yes',              category: 'response' },
  { id: 'no',         text: 'No',               category: 'response' },
  { id: 'maybe',      text: 'Maybe',            category: 'response' },
  { id: 'idk',        text: "I don't know",     category: 'response' },
  { id: 'ty',         text: 'Thank you',        category: 'greet'    },
  { id: 'hello',      text: 'Hello',            category: 'greet'    },
  { id: 'goodbye',    text: 'Goodbye',          category: 'greet'    },
  { id: 'please',     text: 'Please',           category: 'greet'    },
  { id: 'sorry',      text: "I'm sorry",        category: 'greet'    },
  { id: 'welcome',    text: "You're welcome",   category: 'greet'    },
  { id: 'help',       text: 'I need help',      category: 'need'     },
  { id: 'hungry',     text: "I'm hungry",       category: 'need'     },
  { id: 'thirsty',    text: "I'm thirsty",      category: 'need'     },
  { id: 'tired',      text: "I'm tired",        category: 'need'     },
  { id: 'pain',       text: "I'm in pain",      category: 'need'     },
  { id: 'bathroom',   text: 'Bathroom please',  category: 'need'     },
  { id: 'home',       text: 'Take me home',     category: 'need'     },
  { id: 'outside',    text: 'Go outside',       category: 'need'     },
  { id: 'happy',      text: "I'm happy",        category: 'feel'     },
  { id: 'sad',        text: "I'm sad",          category: 'feel'     },
  { id: 'scared',     text: "I'm scared",       category: 'feel'     },
  { id: 'frustrated', text: "I'm frustrated",   category: 'feel'     },
  { id: 'ok',         text: "I'm okay",         category: 'feel'     },
  { id: 'love',       text: 'I love you',       category: 'feel'     },
  { id: 'wait',       text: 'Please wait',      category: 'request'  },
  { id: 'repeat',     text: 'Please repeat',    category: 'request'  },
  { id: 'louder',     text: 'Speak louder',     category: 'request'  },
  { id: 'slower',     text: 'Speak slower',     category: 'request'  },
  { id: 'stop',       text: 'Stop',             category: 'request'  },
  { id: 'continue',   text: 'Continue',         category: 'request'  },
]

const CAT_COLOR: Record<Category, string> = {
  response: 'var(--cat-response)',
  greet:    'var(--cat-greet)',
  need:     'var(--cat-need)',
  feel:     'var(--cat-feel)',
  request:  'var(--cat-request)',
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
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

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

// ── useDwell hook ─────────────────────────────────────────────────────────────

function useDwell(durationMs: number, onDwell: () => void, disabled = false) {
  const [active, setActive] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep refs so the timer callback always calls the latest versions
  const durationRef = useRef(durationMs)
  durationRef.current = durationMs
  const onDwellRef = useRef(onDwell)
  onDwellRef.current = onDwell
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  const start = useCallback(() => {
    if (disabledRef.current || timerRef.current) return
    setActive(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setActive(false)
      onDwellRef.current()
    }, durationRef.current)
  }, []) // stable — reads everything via refs

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setActive(false)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return { active, start, cancel }
}

// ── PhraseCell ────────────────────────────────────────────────────────────────

function PhraseCell({ phrase, onSelect }: { phrase: Phrase; onSelect: (p: Phrase) => void }) {
  const { settings } = useContext(SettingsCtx)
  const [flash, setFlash] = useState(false)

  const handleDwell = useCallback(() => {
    onSelect(phrase)
    setFlash(true)
    setTimeout(() => setFlash(false), 350)
  }, [phrase, onSelect])

  const { active, start, cancel } = useDwell(settings.phraseDwellMs, handleDwell)

  return (
    <div
      className={['phrase-cell', active ? 'dwelling' : '', flash ? 'selected' : ''].filter(Boolean).join(' ')}
      style={{ '--cat-color': CAT_COLOR[phrase.category], '--dwell-duration': `${settings.phraseDwellMs}ms` } as React.CSSProperties}
      onPointerEnter={start}
      onPointerLeave={cancel}
    >
      <span className="phrase-cell-text">{phrase.text}</span>
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

// ── ActionButton ──────────────────────────────────────────────────────────────

function ActionButton({
  onSelect, className = '', children, label, disabled = false, dwellMs,
}: {
  onSelect: () => void
  className?: string
  children: React.ReactNode
  label: string
  disabled?: boolean
  dwellMs?: number
}) {
  const { settings } = useContext(SettingsCtx)
  const ms = dwellMs ?? settings.actionDwellMs
  const [flash, setFlash] = useState(false)

  const handleDwell = useCallback(() => {
    if (disabled) return
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }, [disabled, onSelect])

  const { active, start, cancel } = useDwell(ms, handleDwell, disabled)

  return (
    <button
      className={['icon-btn', className, active ? 'dwelling' : '', flash ? 'selected' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${ms}ms` } as React.CSSProperties}
      onPointerEnter={start}
      onPointerLeave={cancel}
      aria-label={label}
      tabIndex={-1}
    >
      <div className="dwell-ring" />
      {children}
    </button>
  )
}

// ── DrawerItem ────────────────────────────────────────────────────────────────

function DrawerItem({
  icon, label, sublabel, onSelect, dwellMs = 1000,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  onSelect: () => void
  dwellMs?: number
}) {
  const [flash, setFlash] = useState(false)

  const handleDwell = useCallback(() => {
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 350)
  }, [onSelect])

  const { active, start, cancel } = useDwell(dwellMs, handleDwell)

  return (
    <div
      className={['drawer-item', active ? 'dwelling' : '', flash ? 'selected' : ''].filter(Boolean).join(' ')}
      style={{ '--dwell-duration': `${dwellMs}ms` } as React.CSSProperties}
      onPointerEnter={start}
      onPointerLeave={cancel}
      role="button"
      aria-label={label}
    >
      <div className="drawer-item-icon">{icon}</div>
      <div className="drawer-item-text">
        <span className="drawer-item-label">{label}</span>
        {sublabel && <span className="drawer-item-sub">{sublabel}</span>}
      </div>
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

// ── DwellStepper ──────────────────────────────────────────────────────────────

function DwellStepper({
  label, value, onDecrement, onIncrement, display,
}: {
  label: string
  value: number
  display: string
  onDecrement: () => void
  onIncrement: () => void
}) {
  const STEP_DWELL = 800

  const [flashDec, setFlashDec] = useState(false)
  const [flashInc, setFlashInc] = useState(false)

  const handleDec = useCallback(() => { onDecrement(); setFlashDec(true); setTimeout(() => setFlashDec(false), 250) }, [onDecrement])
  const handleInc = useCallback(() => { onIncrement(); setFlashInc(true); setTimeout(() => setFlashInc(false), 250) }, [onIncrement])

  const dec = useDwell(STEP_DWELL, handleDec)
  const inc = useDwell(STEP_DWELL, handleInc)

  return (
    <div className="stepper-row">
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <div
          className={['stepper-btn', dec.active ? 'dwelling' : '', flashDec ? 'selected' : ''].filter(Boolean).join(' ')}
          style={{ '--dwell-duration': `${STEP_DWELL}ms` } as React.CSSProperties}
          onPointerEnter={dec.start} onPointerLeave={dec.cancel}
          role="button" aria-label={`Decrease ${label}`}
        >
          <div className="dwell-ring" />
          <MinusIcon />
        </div>
        <span className="stepper-value">{display}</span>
        <div
          className={['stepper-btn', inc.active ? 'dwelling' : '', flashInc ? 'selected' : ''].filter(Boolean).join(' ')}
          style={{ '--dwell-duration': `${STEP_DWELL}ms` } as React.CSSProperties}
          onPointerEnter={inc.start} onPointerLeave={inc.cancel}
          role="button" aria-label={`Increase ${label}`}
        >
          <div className="dwell-ring" />
          <PlusIcon />
        </div>
      </div>
    </div>
  )
}

// ── Drawer ────────────────────────────────────────────────────────────────────

type DrawerView = 'menu' | 'settings' | 'signin'

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, setSettings } = useContext(SettingsCtx)
  const [view, setView] = useState<DrawerView>('menu')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [user, setUser] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!open) setTimeout(() => setView('menu'), 300)
  }, [open])

  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  const handleSignIn = useCallback(() => {
    setSigningIn(true)
    setTimeout(() => { setUser('user@example.com'); setSigningIn(false) }, 1200)
  }, [])

  const handleSignOut = useCallback(() => setUser(null), [])

  const clampPhrase = (v: number) => Math.max(500, Math.min(3000, v))
  const clampAction = (v: number) => Math.max(300, Math.min(2000, v))

  return (
    <>
      {/* Scrim */}
      <div
        className={`drawer-scrim ${open ? 'open' : ''}`}
        onPointerEnter={onClose}
      />

      {/* Drawer panel */}
      <div className={`drawer ${open ? 'open' : ''}`} role="dialog" aria-label="Menu">
        {/* Handle / close row */}
        <div className="drawer-header">
          {view !== 'menu' && (
            <ActionButton
              onSelect={() => setView('menu')}
              label="Back"
              dwellMs={600}
              className="drawer-back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </ActionButton>
          )}
          <span className="drawer-title">
            {view === 'menu' ? 'Menu' : view === 'settings' ? 'Settings' : 'Sign In'}
          </span>
          <ActionButton onSelect={onClose} label="Close menu" dwellMs={600} className="drawer-close">
            <CloseIcon />
          </ActionButton>
        </div>

        {/* Menu view */}
        {view === 'menu' && (
          <div className="drawer-body">
            <DrawerItem
              icon={<SettingsIcon />}
              label="Settings"
              sublabel="Dwell time, voice"
              onSelect={() => setView('settings')}
            />
            <DrawerItem
              icon={<UserIcon />}
              label={user ? `Signed in as ${user}` : 'Sign In'}
              sublabel={user ? 'Dwell to sign out' : 'Save your phrases and settings'}
              onSelect={() => user ? handleSignOut() : setView('signin')}
            />
          </div>
        )}

        {/* Settings view */}
        {view === 'settings' && (
          <div className="drawer-body">
            <div className="drawer-section-label">Dwell timing</div>
            <DwellStepper
              label="Phrase dwell"
              value={settings.phraseDwellMs}
              display={`${(settings.phraseDwellMs / 1000).toFixed(1)}s`}
              onDecrement={() => setSettings({ ...settings, phraseDwellMs: clampPhrase(settings.phraseDwellMs - 250) })}
              onIncrement={() => setSettings({ ...settings, phraseDwellMs: clampPhrase(settings.phraseDwellMs + 250) })}
            />
            <DwellStepper
              label="Action dwell"
              value={settings.actionDwellMs}
              display={`${(settings.actionDwellMs / 1000).toFixed(1)}s`}
              onDecrement={() => setSettings({ ...settings, actionDwellMs: clampAction(settings.actionDwellMs - 100) })}
              onIncrement={() => setSettings({ ...settings, actionDwellMs: clampAction(settings.actionDwellMs + 100) })}
            />
            {voices.length > 0 && (
              <>
                <div className="drawer-section-label" style={{ marginTop: 20 }}>Voice</div>
                <div className="voice-list">
                  {voices.slice(0, 8).map(v => (
                    <DrawerItem
                      key={v.name}
                      icon={<span style={{ fontSize: 18 }}>{settings.voice === v.name ? '●' : '○'}</span>}
                      label={v.name}
                      sublabel={v.lang}
                      onSelect={() => setSettings({ ...settings, voice: v.name })}
                      dwellMs={800}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Sign-in view */}
        {view === 'signin' && (
          <div className="drawer-body">
            {signingIn
              ? <div className="signin-status">Signing in…</div>
              : (
                <>
                  <DrawerItem
                    icon={<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
                    label="Continue with Google"
                    onSelect={handleSignIn}
                    dwellMs={1000}
                  />
                  <DrawerItem
                    icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 10.5h-3v8h-3v-8h-2v-3h2V7.5C10.5 5.57 11.57 4.5 13.5 4.5h3v3h-2c-.553 0-1 .447-1 1v1.5h3l-.5 3z"/></svg>}
                    label="Continue with Facebook"
                    onSelect={handleSignIn}
                    dwellMs={1000}
                  />
                  <div className="signin-divider"><span>or</span></div>
                  <DrawerItem
                    icon={<UserIcon />}
                    label="Use email"
                    sublabel="Sign in with your account"
                    onSelect={handleSignIn}
                    dwellMs={1000}
                  />
                </>
              )
            }
          </div>
        )}

        {/* Drag handle */}
        <div className="drawer-handle-bar" />
      </div>
    </>
  )
}

// ── DwellCursor ───────────────────────────────────────────────────────────────
// Self-contained: tracks pointer via DOM ref so cursor moves don't re-render App

function DwellCursor() {
  const elRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (elRef.current) {
        elRef.current.style.left = `${e.clientX}px`
        elRef.current.style.top = `${e.clientY}px`
      }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <div ref={elRef} className="dwell-cursor" style={{ left: -100, top: -100 }}>
      <div className="dwell-cursor-dot" />
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState<Settings>({
    phraseDwellMs: PHRASE_DWELL_DEFAULT,
    actionDwellMs: ACTION_DWELL_DEFAULT,
    voice: '',
  })
  const [text, setText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const showUndo = !text && history.length > 0
  const handleSelectPhrase = useCallback((phrase: Phrase) => {
    setHistory(h => [...h, text])
    setText(t => (t ? t + ' ' + phrase.text : phrase.text))
  }, [text])

  const handleClearOrUndo = useCallback(() => {
    if (text) { setHistory(h => [...h, text]); setText('') }
    else if (history.length) { setText(history[history.length - 1]); setHistory(h => h.slice(0, -1)) }
  }, [text, history])

  const handleSpeak = useCallback(() => {
    if (!text || !('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    if (settings.voice) {
      const v = speechSynthesis.getVoices().find(v => v.name === settings.voice)
      if (v) utt.voice = v
    }
    speechSynthesis.speak(utt)
  }, [text, settings.voice])

  return (
    <SettingsCtx.Provider value={{ settings, setSettings }}>
      <div className="app" style={{ cursor: 'none' }}>

        {/* ── Menu bar ── */}
        <div className="menu-bar">
          <ActionButton
            onSelect={() => setDrawerOpen(o => !o)}
            label={drawerOpen ? 'Close menu' : 'Open menu'}
            dwellMs={600}
            className="menu-trigger"
          >
            <MenuIcon />
          </ActionButton>
          <span className="menu-bar-title">AAC</span>
        </div>

        {/* ── Topbar ── */}
        <header className="topbar">
          <ActionButton
            className="left"
            onSelect={handleClearOrUndo}
            label={showUndo ? 'Undo' : 'Clear'}
            disabled={!text && !history.length}
          >
            {showUndo ? <UndoIcon /> : <ClearIcon />}
          </ActionButton>

          <div className="text-display" aria-live="polite" aria-label="Composed message">
            {text
              ? text
              : <span className="placeholder">Dwell on a phrase to compose&hellip;</span>
            }
          </div>

          <ActionButton
            className="right"
            onSelect={handleSpeak}
            label="Speak"
            disabled={!text}
          >
            <SpeakIcon />
          </ActionButton>
        </header>

        {/* ── Phrase grid ── */}
        <main className="grid-wrapper">
          <div className="phrase-grid" role="grid" aria-label="Phrase selection grid">
            {PHRASES.map(phrase => (
              <PhraseCell key={phrase.id} phrase={phrase} onSelect={handleSelectPhrase} />
            ))}
          </div>
        </main>

        {/* ── Drawer ── */}
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        {/* ── Dwell cursor ── */}
        <DwellCursor />
      </div>
    </SettingsCtx.Provider>
  )
}

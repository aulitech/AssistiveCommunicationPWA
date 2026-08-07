import { useState, useRef, useCallback, useEffect, useMemo, memo, createContext, useContext } from 'react'
import { SIGN_IN, SignInCancelled, configuredProviders, type Provider } from './auth'
import { HELP_SECTIONS } from './help'
import { legalDocumentFor } from './legal'
import type { ProseDocument, ProseSection } from './prose'
import { useDwellControl, cancelAllDwells } from './dwell'
import { speak, subscribeVoices } from './speech'
import {
  EMPTY_PROFILE,
  buildPhrases,
  BLANK,
  compose,
  hasChoices,
  parseSegments,
  plainPhrase,
  type Phrase,
  type Profile,
} from './phrases'

// ── Types ────────────────────────────────────────────────────────────────────

type Screen = 'signin' | 'app'

interface User {
  name: string
  email: string
  provider: 'google' | 'apple' | 'facebook' | 'guest'
  avatar?: string
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' ')

const dwellVar = (ms: number) => ({ '--dwell-duration': `${ms}ms` }) as React.CSSProperties

// ── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'dwellspeak_settings'

interface Settings {
  phraseDwellMs: number
  actionDwellMs: number
  voiceURI: string // empty = default
  volume: number // 0–1
  rate: number // 0.5–2
  /** Speak each selected phrase immediately instead of composing a message. */
  autoSpeak: boolean
}

const DEFAULT_SETTINGS: Settings = {
  phraseDwellMs: 1500,
  actionDwellMs: 800,
  voiceURI: '',
  volume: 1,
  rate: 1,
  autoSpeak: false,
}

function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

const SettingsCtx = createContext<{ settings: Settings; update: (patch: Partial<Settings>) => void }>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
})

const useSettings = () => useContext(SettingsCtx)

// ── Edit context ─────────────────────────────────────────────────────────────

interface EditCtxValue {
  editMode: boolean
  openEdit: (phrase: Phrase | null, isEmergency?: boolean) => void // null = new phrase
}

const EditCtx = createContext<EditCtxValue>({ editMode: false, openEdit: () => {} })
const useEdit = () => useContext(EditCtx)

// ── Phrase store (user edits persisted to localStorage) ───────────────────────
// v2: ids are content-derived rather than array indices, so saved edits no
// longer reattach to a neighbouring phrase when phrasetable.json changes.

const PHRASE_STORE_KEY = 'dwellspeak_phrase_store_v2'

interface StoredPhrase {
  id: string
  text: string
  category: string
}

interface PhraseStore {
  custom: StoredPhrase[] // user-added phrases
  overrides: Record<string, string> // id → new text
  hidden: string[] // ids removed by user
  /**
   * Source category name → the name to show. A single entry renames a whole
   * category, including the built-in phrases in it, which per-phrase overrides
   * could not do.
   */
  categoryRenames: Record<string, string>
  /** Categories the user created. Kept so one can exist before it has phrases. */
  categories: string[]
  /** id → category, for a single phrase moved out of the one it came in. */
  categoryOverrides: Record<string, string>
  /**
   * The order to show category tabs in. Empty means alphabetical — the default,
   * and what "Sort A–Z" returns to. Names missing from a non-empty list sit at
   * the end, alphabetically, so a category added later has a settled place
   * without every addition having to rewrite the order.
   */
  categoryOrder: string[]
}

const emptyStore = (): PhraseStore => ({
  custom: [],
  overrides: {},
  hidden: [],
  categoryRenames: {},
  categories: [],
  categoryOverrides: {},
  categoryOrder: [],
})

function loadPhraseStore(): PhraseStore {
  try {
    const raw = JSON.parse(localStorage.getItem(PHRASE_STORE_KEY) ?? '{}')
    const base = emptyStore()
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null)
    return {
      custom: Array.isArray(raw.custom) ? raw.custom : base.custom,
      overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : base.overrides,
      hidden: Array.isArray(raw.hidden) ? raw.hidden : base.hidden,
      categoryRenames:
        raw.categoryRenames && typeof raw.categoryRenames === 'object' ? raw.categoryRenames : base.categoryRenames,
      categories: strings(raw.categories) ?? base.categories,
      categoryOverrides:
        raw.categoryOverrides && typeof raw.categoryOverrides === 'object'
          ? raw.categoryOverrides
          : base.categoryOverrides,
      categoryOrder: strings(raw.categoryOrder) ?? base.categoryOrder,
    }
  } catch {
    return emptyStore()
  }
}

/** The name a category is shown under, after any rename. */
function displayCategory(source: string, renames: Record<string, string>): string {
  return renames[source] ?? source
}

/**
 * Rename every source category currently displayed as `from` so it shows as
 * `to`. Renaming onto an existing name merges the two, which is the only sane
 * reading of giving two categories the same name.
 */
function renameCategory(store: PhraseStore, from: string, to: string): Partial<PhraseStore> {
  const renames = { ...store.categoryRenames }
  for (const [source, shown] of Object.entries(renames)) {
    if (shown === from) renames[source] = to
  }
  // A source that has never been renamed still displays under its own name.
  if (!(from in renames)) renames[from] = to
  // Identity entries carry no information.
  for (const [source, shown] of Object.entries(renames)) {
    if (source === shown) delete renames[source]
  }
  return {
    categoryRenames: renames,
    categories: [...new Set(store.categories.map(c => (c === from ? to : c)))],
    // A renamed category keeps the place its old name held; a merge collapses
    // onto the earlier of the two positions.
    categoryOrder: [...new Set(store.categoryOrder.map(c => (c === from ? to : c)))],
  }
}

/**
 * Arrange category names for display. An empty `order` means alphabetical;
 * otherwise the names it lists come first in that order and anything it has
 * never heard of follows, alphabetically.
 */
function orderCategories(names: string[], order: string[]): string[] {
  if (order.length === 0) return [...names].sort()
  const rank = new Map(order.map((name, i) => [name, i]))
  const ranked = names.filter(n => rank.has(n)).sort((a, b) => rank.get(a)! - rank.get(b)!)
  const rest = names.filter(n => !rank.has(n)).sort()
  return [...ranked, ...rest]
}

/**
 * The full order after moving `from` to where `to` sits. Landing after the
 * target when moving rightwards and before it when moving leftwards is what
 * puts the category where the pointer actually is, either way.
 */
function moveCategory(shown: string[], from: string, to: string): string[] {
  const fromIndex = shown.indexOf(from)
  const toIndex = shown.indexOf(to)
  if (fromIndex < 0 || toIndex < 0 || from === to) return shown
  const rest = shown.filter(c => c !== from)
  rest.splice(rest.indexOf(to) + (fromIndex < toIndex ? 1 : 0), 0, from)
  return rest
}

function savePhraseStore(s: PhraseStore) {
  localStorage.setItem(PHRASE_STORE_KEY, JSON.stringify(s))
}

// ── Profile ──────────────────────────────────────────────────────────────────
// Fills the `contacts` and `name` aliases the phrase table ships empty, so
// phrases like "I'm going to call {contact}" have something to offer.

const PROFILE_KEY = 'dwellspeak_profile'

function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}')
    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    return {
      name: {
        given: str(raw?.name?.given),
        surname: str(raw?.name?.surname),
        nickname: str(raw?.name?.nickname),
      },
      contacts: Array.isArray(raw?.contacts) ? raw.contacts.filter((c: unknown) => typeof c === 'string') : [],
    }
  } catch {
    return EMPTY_PROFILE
  }
}

function saveProfile(p: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

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
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.74 3.17.78 1.21-.24 2.37-.93 3.67-.84 1.56.12 2.73.72 3.5 1.9-3.22 1.94-2.45 6.06.56 7.34-.65 1.58-1.51 3.17-2.9 3.7zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="#1877F2" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function AppLogoIcon() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="56" height="56" rx="16" fill="var(--accent)" fillOpacity="0.12"/>
      <path d="M10 16C10 13.8 11.8 12 14 12H42C44.2 12 46 13.8 46 16V34C46 36.2 44.2 38 42 38H30L22 46V38H14C11.8 38 10 36.2 10 34V16Z" fill="var(--accent)" fillOpacity="0.2" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="20" cy="25" r="2.5" fill="var(--accent)"/>
      <circle cx="28" cy="25" r="2.5" fill="var(--accent)"/>
      <circle cx="36" cy="25" r="2.5" fill="var(--accent)"/>
    </svg>
  )
}

function AutoSpeakIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <polygon points="10 5 6 9 3 9 3 15 6 15 10 19 10 5" />
      <polyline points="18 6 15 11.5 19 11.5 16 18" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="20" height="20" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
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
        ref.current.style.top = `${e.clientY}px`
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  return (
    <div ref={ref} className="dwell-cursor" style={{ left: -100, top: -100 }} aria-hidden="true">
      <div className="dwell-cursor-dot" />
    </div>
  )
}

// ── DwellButton ───────────────────────────────────────────────────────────────
// Generic dwell-activated button used where there is no bespoke markup.

function DwellButton({
  onSelect,
  children,
  className = '',
  label,
  disabled = false,
  durationMs,
}: {
  onSelect: () => void
  children: React.ReactNode
  className?: string
  label: string
  disabled?: boolean
  durationMs: number
}) {
  const [flash, setFlash] = useState(false)

  const handleActivate = useCallback(() => {
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 320)
  }, [onSelect])

  const { active, props } = useDwellControl(durationMs, handleActivate, { disabled })

  return (
    <div
      role="button"
      aria-label={label}
      className={cx(className, active && 'dwelling', flash && 'flashed', disabled && 'is-disabled')}
      style={{ '--dwell-ms': `${durationMs}ms` } as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  )
}

// ── PhraseCell ────────────────────────────────────────────────────────────────

const PhraseCell = memo(function PhraseCell({
  phrase,
  onSelect,
}: {
  phrase: Phrase
  onSelect: (p: Phrase) => void
}) {
  const { settings } = useSettings()
  const { editMode, openEdit } = useEdit()
  const [flash, setFlash] = useState(false)

  const handleActivate = useCallback(() => {
    if (editMode) {
      openEdit(phrase)
      return
    }
    onSelect(phrase)
    setFlash(true)
    setTimeout(() => setFlash(false), 350)
  }, [phrase, onSelect, editMode, openEdit])

  const { active, props } = useDwellControl(settings.phraseDwellMs, handleActivate)
  const fillable = hasChoices(phrase.segments)

  return (
    <div
      className={cx('phrase-cell', active && 'dwelling', flash && 'selected', editMode && 'edit-mode')}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      aria-label={editMode ? `Edit phrase: ${phrase.text}` : fillable ? `${phrase.text} — choose wording` : phrase.text}
      {...props}
    >
      <span className="phrase-cell-text">
        {phrase.segments.map((segment, i) =>
          segment.kind === 'text' ? (
            <span key={i}>{segment.text}</span>
          ) : (
            <span key={i} className={cx('phrase-slot', segment.options.length === 0 && 'is-blank')}>
              {segment.label}
            </span>
          ),
        )}
      </span>
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
})

// ── SlotPicker ────────────────────────────────────────────────────────────────
// Phrases from the table are fill-in-the-blank ("Please turn {control} the
// {['music','tv']}"). Selecting one walks the user through its slots by dwell
// rather than dropping raw placeholder text into the message.

function SlotOption({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const { settings } = useSettings()
  const handle = useCallback(() => onPick(value), [value, onPick])
  const { active, props } = useDwellControl(settings.phraseDwellMs, handle)
  return (
    <div
      className={cx('slot-option', active && 'dwelling')}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      aria-label={value}
      {...props}
    >
      {value}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function SlotPicker({ phrase, onComplete, onCancel }: {
  phrase: Phrase
  onComplete: (text: string) => void
  onCancel: () => void
}) {
  const { settings } = useSettings()
  const [choices, setChoices] = useState<(string | null)[]>(() =>
    phrase.segments.filter(s => s.kind === 'slot').map(() => null),
  )

  // Indices (within the slot sequence) that the user actually chooses from.
  const steps = useMemo(() => {
    const out: number[] = []
    let slot = -1
    for (const segment of phrase.segments) {
      if (segment.kind !== 'slot') continue
      slot++
      if (segment.options.length > 0) out.push(slot)
    }
    return out
  }, [phrase])

  const [step, setStep] = useState(0)
  const slotIndex = steps[step]

  const options = useMemo(() => {
    let slot = -1
    for (const segment of phrase.segments) {
      if (segment.kind !== 'slot') continue
      slot++
      if (slot === slotIndex) return segment.options
    }
    return []
  }, [phrase, slotIndex])

  const pick = useCallback(
    (value: string) => {
      const next = [...choices]
      next[slotIndex] = value
      setChoices(next)
      if (step + 1 < steps.length) setStep(step + 1)
      else onComplete(compose(phrase.segments, next))
    },
    [choices, slotIndex, step, steps.length, phrase, onComplete],
  )

  const cancelHook = useDwellControl(settings.actionDwellMs, onCancel)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Preview with choices made so far; the slot in play is highlighted.
  let slot = -1
  const preview = phrase.segments.map((segment, i) => {
    if (segment.kind === 'text') return <span key={i}>{segment.text}</span>
    slot++
    const chosen = choices[slot]
    const isCurrent = slot === slotIndex
    return (
      <span key={i} className={cx('phrase-slot', isCurrent && 'is-current', chosen && 'is-filled')}>
        {chosen ?? (segment.options.length ? segment.label : BLANK)}
      </span>
    )
  })

  return (
    <div className="slot-picker-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="slot-picker" role="dialog" aria-modal="true" aria-label="Choose wording">
        <div className="slot-picker-preview">{preview}</div>
        <div className="slot-picker-step">
          Choose {steps.length > 1 ? `${step + 1} of ${steps.length}` : 'a word'}
        </div>
        <div className="slot-options" role="group">
          {options.map(option => (
            <SlotOption key={option} value={option} onPick={pick} />
          ))}
        </div>
        <div
          className={cx('slot-cancel', cancelHook.active && 'dwelling')}
          style={dwellVar(settings.actionDwellMs)}
          role="button"
          aria-label="Cancel"
          {...cancelHook.props}
        >
          <div className="dwell-bar" key={cancelHook.active ? 'a' : 'i'} />
          Cancel
        </div>
      </div>
    </div>
  )
}

// ── ActionButton ──────────────────────────────────────────────────────────────

function ActionButton({ onSelect, className = '', children, label, disabled }: {
  onSelect: () => void
  className?: string
  children: React.ReactNode
  label: string
  disabled?: boolean
}) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)

  const handleActivate = useCallback(() => {
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }, [onSelect])

  const { active, props } = useDwellControl(settings.actionDwellMs, handleActivate, { disabled: !!disabled })

  return (
    <button
      type="button"
      className={cx('icon-btn', className, active && 'dwelling', flash && 'selected', disabled && 'opacity-30')}
      style={dwellVar(settings.actionDwellMs)}
      aria-label={label}
      disabled={disabled}
      {...props}
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
  { icon: '📱', title: 'Works offline', body: 'Install it and it keeps working with no network.' },
  { icon: '🔒', title: 'Stays on your device', body: 'Your phrases and settings are stored locally, never uploaded.' },
]

const PROVIDER_LABELS: Record<Provider, string> = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
}

function SignInPage({ onSignIn }: { onSignIn: (user: User) => void }) {
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
      <div className="signin-brand">
        <div className="signin-logo"><AppLogoIcon /></div>
        <h1 className="signin-app-name">DwellSpeak</h1>
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

      <DwellCursor />
    </div>
  )
}

// ── Panel navigation ──────────────────────────────────────────────────────────

function NavItem({ icon, label, sublabel, onSelect }: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  onSelect: () => void
}) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)
  const handleActivate = useCallback(() => {
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 320)
  }, [onSelect])
  const { active, props } = useDwellControl(settings.actionDwellMs, handleActivate)

  return (
    <div
      className={cx('nav-item', active && 'dwelling', flash && 'flashed')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      {...props}
    >
      <span className="nav-item-icon" aria-hidden="true">{icon}</span>
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
  const { active, props } = useDwellControl(settings.actionDwellMs, onAction, { repeatMs: 200 })
  return (
    <div
      className={cx('step-btn', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      {children}
    </div>
  )
}

function SettingSpinner({ value, min, max, step, format, onValue }: {
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onValue: (v: number) => void
}) {
  const clamp = useCallback(
    (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step)),
    [min, max, step],
  )
  const dec = useCallback(() => onValue(clamp(value - step)), [value, step, onValue, clamp])
  const inc = useCallback(() => onValue(clamp(value + step)), [value, step, onValue, clamp])

  return (
    <div className="setting-spinner">
      <StepBtn onAction={dec} label="Decrease">−</StepBtn>
      <input
        className="setting-number"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => {
          const n = Number(e.target.value)
          if (!isNaN(n)) onValue(clamp(n))
        }}
      />
      <span className="setting-formatted">{format(value)}</span>
      <StepBtn onAction={inc} label="Increase">+</StepBtn>
    </div>
  )
}

function VoiceDropdownItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onSelect)
  return (
    <div
      className={cx('voice-option', selected && 'selected', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="option"
      aria-selected={selected}
      {...props}
    >
      {label}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function ScrollNudge({ direction, onScroll, step = 80 }: {
  direction: 'up' | 'down'
  onScroll: (dy: number) => void
  step?: number
}) {
  const { settings } = useSettings()
  const dy = direction === 'up' ? -step : step
  const handle = useCallback(() => onScroll(dy), [onScroll, dy])
  const { active, props } = useDwellControl(settings.actionDwellMs, handle, { repeatMs: 180 })
  return (
    <div
      className={cx('pane-scroll-btn', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={direction === 'up' ? 'Scroll up' : 'Scroll down'}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
        {direction === 'up' ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
    </div>
  )
}

/**
 * A scrollable area with dwell-driven arrows, shown only when there is
 * somewhere to scroll. A dwell user cannot reach a scrollbar or a wheel.
 */
function ScrollPane({ className = '', paneClassName = '', step = 80, children }: {
  className?: string
  paneClassName?: string
  step?: number
  children: React.ReactNode
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [canUp, setCanUp] = useState(false)
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
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [update])

  const scrollBy = useCallback((dy: number) => listRef.current?.scrollBy({ top: dy, behavior: 'smooth' }), [])

  return (
    <div className={cx('scroll-pane', className)}>
      {canUp && <ScrollNudge direction="up" step={step} onScroll={scrollBy} />}
      <div ref={listRef} className={cx('scroll-pane-inner', paneClassName)}>
        {children}
      </div>
      {canDown && <ScrollNudge direction="down" step={step} onScroll={scrollBy} />}
    </div>
  )
}

function voiceLabel(v: { name: string; lang?: string }) {
  return v.lang ? `${v.name} · ${v.lang}` : v.name
}

function VoiceRow({ voices }: { voices: SpeechSynthesisVoice[] }) {
  const { settings, update } = useSettings()
  const [open, setOpen] = useState(false)
  const items = useMemo(
    () => [{ voiceURI: '', name: 'Default', lang: '' }, ...voices.map(v => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang }))],
    [voices],
  )
  const current = items.find(v => v.voiceURI === settings.voiceURI) ?? items[0]

  const { active, props } = useDwellControl(settings.actionDwellMs, () => setOpen(o => !o))

  return (
    <SettingRow label="Voice">
      <div className="voice-dropdown">
        <div
          className={cx('voice-trigger', active && 'dwelling')}
          style={dwellVar(settings.actionDwellMs)}
          role="combobox"
          aria-expanded={open}
          aria-label={`Voice: ${voiceLabel(current)}`}
          {...props}
        >
          <span className="voice-trigger-label">{voiceLabel(current)}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <div className="dwell-bar" key={active ? 'a' : 'i'} />
        </div>
        {open && (
          <div className="voice-list" role="listbox" onPointerLeave={() => setOpen(false)}>
            <ScrollPane className="voice-scroller" paneClassName="voice-list-inner">
              {items.map((v, i) => (
                <VoiceDropdownItem
                  key={`${v.voiceURI}-${i}`}
                  label={voiceLabel(v)}
                  selected={v.voiceURI === settings.voiceURI}
                  onSelect={() => {
                    update({ voiceURI: v.voiceURI })
                    setOpen(false)
                  }}
                />
              ))}
            </ScrollPane>
          </div>
        )}
      </div>
    </SettingRow>
  )
}

function SettingsPanel() {
  const { settings, update } = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => subscribeVoices(setVoices), [])

  return (
    <div className="settings-panel">
      <SettingRow label="Phrase dwell">
        <SettingSpinner
          value={settings.phraseDwellMs}
          min={500}
          max={3000}
          step={100}
          format={v => `${(v / 1000).toFixed(1)}s`}
          onValue={v => update({ phraseDwellMs: v })}
        />
      </SettingRow>
      <SettingRow label="Action dwell">
        <SettingSpinner
          value={settings.actionDwellMs}
          min={300}
          max={2000}
          step={100}
          format={v => `${(v / 1000).toFixed(1)}s`}
          onValue={v => update({ actionDwellMs: v })}
        />
      </SettingRow>
      <SettingRow label="Volume">
        <SettingSpinner
          value={Math.round(settings.volume * 100)}
          min={0}
          max={100}
          step={10}
          format={v => `${v}%`}
          onValue={v => update({ volume: v / 100 })}
        />
      </SettingRow>
      <SettingRow label="Speed">
        <SettingSpinner
          value={Math.round(settings.rate * 10)}
          min={5}
          max={20}
          step={1}
          format={v => `${(v / 10).toFixed(1)}×`}
          onValue={v => update({ rate: v / 10 })}
        />
      </SettingRow>
      {voices.length > 0 && <VoiceRow voices={voices} />}
    </div>
  )
}

// ── ProfilePanel ──────────────────────────────────────────────────────────────
// Supplies the values behind {contact} and {name.nickname}. Typed rather than
// dwelled: it is one-off setup, usually done by whoever sets the device up.

function ContactRow({ name, onRemove }: { name: string; onRemove: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onRemove)
  return (
    <div className="contact-row">
      <span className="contact-name">{name}</span>
      <div
        className={cx('contact-remove', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-label={`Remove ${name}`}
        {...props}
      >
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="14" height="14" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    </div>
  )
}

function ProfilePanel({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const { settings } = useSettings()
  const [draft, setDraft] = useState('')

  const setName = (field: keyof Profile['name'], value: string) =>
    onChange({ ...profile, name: { ...profile.name, [field]: value } })

  const addContact = useCallback(() => {
    const name = draft.trim()
    if (!name || profile.contacts.includes(name)) return
    onChange({ ...profile, contacts: [...profile.contacts, name] })
    setDraft('')
  }, [draft, profile, onChange])

  const { active: addActive, props: addProps } = useDwellControl(settings.actionDwellMs, addContact, {
    disabled: draft.trim() === '',
  })

  return (
    <div className="settings-panel">
      <p className="profile-hint">
        Used by phrases that name someone — “This is …”, “I'm going to call …”.
      </p>

      <SettingRow label="Nickname">
        <input
          className="profile-input"
          value={profile.name.nickname}
          onChange={e => setName('nickname', e.target.value)}
          placeholder="What people call you"
          aria-label="Nickname"
        />
      </SettingRow>
      <SettingRow label="First name">
        <input
          className="profile-input"
          value={profile.name.given}
          onChange={e => setName('given', e.target.value)}
          aria-label="First name"
        />
      </SettingRow>
      <SettingRow label="Last name">
        <input
          className="profile-input"
          value={profile.name.surname}
          onChange={e => setName('surname', e.target.value)}
          aria-label="Last name"
        />
      </SettingRow>

      <div className="contact-list" role="group" aria-label="Contacts">
        <span className="setting-label">Contacts</span>
        {profile.contacts.length === 0 && <p className="profile-empty">Nobody added yet.</p>}
        {profile.contacts.map(name => (
          <ContactRow
            key={name}
            name={name}
            onRemove={() => onChange({ ...profile, contacts: profile.contacts.filter(c => c !== name) })}
          />
        ))}
        <div className="contact-add">
          <input
            className="profile-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addContact()
              }
            }}
            placeholder="Add a name…"
            aria-label="Add a contact"
          />
          <div
            className={cx('contact-add-btn', addActive && 'dwelling', !draft.trim() && 'is-disabled')}
            style={dwellVar(settings.actionDwellMs)}
            role="button"
            aria-label="Add contact"
            {...addProps}
          >
            <div className="dwell-bar" key={addActive ? 'a' : 'i'} />
            <PlusIcon />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Prose ─────────────────────────────────────────────────────────────────────

function ProseSections({ sections }: { sections: ProseSection[] }) {
  return (
    <>
      {sections.map(section => (
        <section key={section.title} className="help-section">
          <h3 className="help-section-title">{section.title}</h3>
          {section.blocks.map((block, i) =>
            block.kind === 'text' ? (
              <p key={i} className="help-text">{block.text}</p>
            ) : (
              <ul key={i} className="help-list">
                {block.items.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </>
  )
}

// ── HelpPanel ─────────────────────────────────────────────────────────────────

function HelpPanel() {
  return (
    <div className="help-panel">
      <ScrollPane className="help-scroller" paneClassName="help-body" step={120}>
        {/* The panel spans the full viewport, so the prose needs its own
            column — text running the width of a wide monitor is unreadable. */}
        <div className="help-measure">
          <h2 className="help-title">Using DwellSpeak</h2>
          <ProseSections sections={HELP_SECTIONS} />
          <p className="help-legal-links">
            <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
          </p>
        </div>
      </ScrollPane>
    </div>
  )
}

type PanelView = 'menu' | 'settings' | 'profile' | 'help'

function TopPanel({ open, user, onClose, onSignOut, profile, onProfileChange }: {
  open: boolean
  user: User
  onClose: () => void
  onSignOut: () => void
  profile: Profile
  onProfileChange: (p: Profile) => void
}) {
  const handleSignOut = useCallback(() => {
    onClose()
    onSignOut()
  }, [onClose, onSignOut])
  const [view, setView] = useState<PanelView>('menu')

  // Reset to the menu whenever the panel opens or closes, so it never reopens
  // mid-way into a sub-screen. Adjusting during render rather than in an effect
  // avoids a second render pass with the stale view still on screen.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setView('menu')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const scrimMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleScrimMove = useCallback(() => {
    if (scrimMoveTimer.current) return
    scrimMoveTimer.current = setTimeout(() => {
      scrimMoveTimer.current = null
      onClose()
    }, 600)
  }, [onClose])
  const cancelScrimTimer = useCallback(() => {
    if (scrimMoveTimer.current) {
      clearTimeout(scrimMoveTimer.current)
      scrimMoveTimer.current = null
    }
  }, [])
  useEffect(() => cancelScrimTimer, [cancelScrimTimer])

  return (
    <>
      <div
        className={cx('panel-scrim', open && 'open')}
        onPointerMove={handleScrimMove}
        onPointerLeave={cancelScrimTimer}
      />

      <div className={cx('top-panel', open && 'open')} role="dialog" aria-label="Menu" aria-hidden={!open}>
        {/* User row */}
        <div className="panel-user-row">
          <div className="panel-avatar" aria-hidden="true">
            {user.provider === 'google' && <span style={{ fontSize: 18 }}>G</span>}
            {user.provider === 'apple' && <span style={{ fontSize: 18 }}></span>}
            {user.provider === 'facebook' && <span style={{ fontSize: 18 }}>f</span>}
            {user.provider === 'guest' && <span style={{ fontSize: 18 }}>👤</span>}
          </div>
          <div className="panel-user-info">
            <span className="panel-user-name">{user.name}</span>
            {user.email && <span className="panel-user-email">{user.email}</span>}
          </div>
        </div>

        {view !== 'menu' ? (
          <>
            {view === 'settings' && <SettingsPanel />}
            {view === 'profile' && <ProfilePanel profile={profile} onChange={onProfileChange} />}
            {view === 'help' && <HelpPanel />}
            <nav className="panel-nav">
              <NavItem
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>}
                label="Back"
                onSelect={() => setView('menu')}
              />
            </nav>
          </>
        ) : (
          <nav className="panel-nav">
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
              label="Settings"
              sublabel="Dwell time, voice, volume, speed"
              onSelect={() => setView('settings')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              label="My details"
              sublabel={
                profile.contacts.length
                  ? `${profile.contacts.length} contact${profile.contacts.length === 1 ? '' : 's'}`
                  : 'Your name and contacts'
              }
              onSelect={() => setView('profile')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
              label="Help"
              sublabel="How to use DwellSpeak"
              onSelect={() => setView('help')}
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

// ── EditModal ─────────────────────────────────────────────────────────────────

function EditAction({ kind, label, onActivate, disabled }: {
  kind: 'danger' | 'cancel' | 'save'
  label: string
  onActivate: () => void
  disabled?: boolean
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled })
  return (
    <div
      className={cx('edit-action-btn', kind, active && 'dwelling', disabled && 'is-disabled')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      {label}
    </div>
  )
}

/** Sentinel <option> value; the leading space cannot occur in a trimmed name. */
const NEW_CATEGORY = ' __new_category__'

function EditModal({ phrase, isEmergency, initialText, allCategories, onSave, onDelete, onClose }: {
  phrase: Phrase | null
  isEmergency: boolean
  /** Seeds a new phrase — the composed message, when adding from the message box. */
  initialText?: string
  allCategories: string[]
  onSave: (text: string, category: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [text, setText] = useState(phrase?.text ?? initialText ?? '')
  const [category, setCategory] = useState(phrase?.category ?? allCategories[0] ?? '')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const isNew = phrase === null
  // A brand-new category needs a name before the phrase can be filed under it.
  const canSave = text.trim().length > 0 && (isEmergency || category.trim().length > 0)

  const save = useCallback(() => {
    if (canSave) onSave(text.trim(), category.trim())
  }, [canSave, text, category, onSave])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="edit-modal-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="edit-modal" role="dialog" aria-modal="true" aria-label={isNew ? 'Add phrase' : 'Edit phrase'}>
        <div className="edit-modal-title">
          {isNew ? (isEmergency ? 'Add emergency phrase' : 'Add phrase') : 'Edit phrase'}
        </div>

        <textarea
          className="edit-modal-text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Phrase text…"
          aria-label="Phrase text"
          autoFocus
          rows={3}
        />

        {!isEmergency && (
          <div className="edit-modal-row">
            <label className="edit-modal-label" htmlFor="edit-category">Category</label>
            <select
              id="edit-category"
              className="edit-modal-select"
              value={creatingCategory ? NEW_CATEGORY : category}
              onChange={e => {
                if (e.target.value === NEW_CATEGORY) {
                  setCreatingCategory(true)
                  setCategory('')
                } else {
                  setCreatingCategory(false)
                  setCategory(e.target.value)
                }
              }}
            >
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              {!allCategories.includes(category) && category && !creatingCategory && (
                <option value={category}>{category}</option>
              )}
              <option value={NEW_CATEGORY}>New category…</option>
            </select>
          </div>
        )}

        {!isEmergency && creatingCategory && (
          <div className="edit-modal-row">
            <label className="edit-modal-label" htmlFor="new-category">New name</label>
            <input
              id="new-category"
              className="edit-modal-input"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="Category name…"
              aria-label="New category name"
              autoFocus
            />
          </div>
        )}

        <div className="edit-modal-actions">
          {!isNew && <EditAction kind="danger" label="Delete" onActivate={onDelete} />}
          <EditAction kind="cancel" label="Cancel" onActivate={onClose} />
          <EditAction kind="save" label="Save" onActivate={save} disabled={!canSave} />
        </div>
      </div>
    </div>
  )
}

// ── CategoryModal ─────────────────────────────────────────────────────────────

function CategoryModal({ name, phraseCount, existing, onSave, onDelete, onClose }: {
  name: string | null // null = creating a new one
  phraseCount: number
  existing: string[]
  onSave: (name: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [value, setValue] = useState(name ?? '')
  const isNew = name === null
  const trimmed = value.trim()

  const clash = existing.some(c => c !== name && c.toLowerCase() === trimmed.toLowerCase())
  const canSave = trimmed !== '' && trimmed !== name && !clash
  // Only a category with nothing in it can go; otherwise deleting it would
  // silently take phrases with it.
  const canDelete = !isNew && phraseCount === 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="edit-modal-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="edit-modal" role="dialog" aria-modal="true" aria-label={isNew ? 'Add category' : 'Rename category'}>
        <div className="edit-modal-title">{isNew ? 'Add category' : 'Rename category'}</div>

        <input
          className="edit-modal-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && canSave) {
              e.preventDefault()
              onSave(trimmed)
            }
          }}
          placeholder="Category name…"
          aria-label="Category name"
          autoFocus
        />

        {clash && <p className="edit-modal-note">A category is already called that.</p>}
        {!isNew && phraseCount > 0 && (
          <p className="edit-modal-note">
            {phraseCount} phrase{phraseCount === 1 ? '' : 's'} will move with it. Empty a category before
            deleting it.
          </p>
        )}

        <div className="edit-modal-actions">
          {canDelete && <EditAction kind="danger" label="Delete" onActivate={onDelete} />}
          <EditAction kind="cancel" label="Cancel" onActivate={onClose} />
          <EditAction kind="save" label="Save" onActivate={() => onSave(trimmed)} disabled={!canSave} />
        </div>
      </div>
    </div>
  )
}

// ── Emergency phrases ─────────────────────────────────────────────────────────

const EMERGENCY_PHRASES: Phrase[] = [
  ['em-0', 'Help me!'],
  ['em-1', "I'm in pain"],
  ['em-2', 'Call 911'],
  ['em-3', 'Get a doctor'],
  ['em-4', "I can't breathe"],
  ['em-5', 'Call my family'],
].map(([id, text]) => plainPhrase(id, text, 'Emergency'))

function EmergencyButton({ phrase }: { phrase: Phrase }) {
  const { settings } = useSettings()
  const { editMode, openEdit } = useEdit()
  const [flash, setFlash] = useState(false)

  const handleActivate = useCallback(() => {
    if (editMode) {
      openEdit(phrase, true)
      return
    }
    speak(phrase.text, settings)
    setFlash(true)
    setTimeout(() => setFlash(false), 400)
  }, [phrase, editMode, openEdit, settings])

  // Emergency phrases use the same dwell time as any other phrase. A shorter
  // fixed value would fire early for anyone who lengthened their dwell because
  // of tremor — exactly the users most likely to need this bar.
  const { active, props } = useDwellControl(settings.phraseDwellMs, handleActivate)

  return (
    <div
      className={cx('emergency-btn', active && 'dwelling', flash && 'flashed', editMode && 'edit-mode')}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      aria-label={editMode ? `Edit emergency phrase: ${phrase.text}` : phrase.text}
      {...props}
    >
      <span className="emergency-label">{phrase.text}</span>
      <div className="emergency-dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function EmergencyAddButton() {
  const { settings } = useSettings()
  const { openEdit } = useEdit()
  const handleActivate = useCallback(() => openEdit(null, true), [openEdit])
  const { active, props } = useDwellControl(settings.actionDwellMs, handleActivate)
  return (
    <div
      className={cx('emergency-btn emergency-add', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label="Add emergency phrase"
      {...props}
    >
      <PlusIcon />
      <div className="emergency-dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function EmergencyBar({ phrases }: { phrases: Phrase[] }) {
  const { editMode } = useEdit()
  if (phrases.length === 0 && !editMode) return null
  return (
    <div className="emergency-bar" role="group" aria-label="Emergency phrases">
      {phrases.map(p => <EmergencyButton key={p.id} phrase={p} />)}
      {editMode && <EmergencyAddButton />}
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

/**
 * Reordering by pointer-drag needs a button held down while the pointer moves,
 * which is exactly the gesture a dwell user cannot make. So a tab can also be
 * *lifted* — one dwell picks it up, a second dwell on another tab drops it
 * there. `held` is the lifted tab; `heldLabel` is what is currently in the air,
 * which every other tab needs in order to say what dropping would do.
 */
interface ReorderProps {
  held: boolean
  heldLabel: string | null
  /** True while a native drag is in flight, which suspends the dwell. */
  dragging: boolean
  dropTarget: boolean
  onLiftOrDrop: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
  onDrop: () => void
}

function FilterTab({ label, active, onSelect, onEdit, reorder }: {
  label: string
  active: boolean
  onSelect: () => void
  onEdit?: () => void
  /** Present only in reorder mode, and never on "All". */
  reorder?: ReorderProps
}) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)
  const handleActivate = useCallback(() => {
    // Reordering takes precedence: while it is on, a tab is a thing to move
    // rather than a thing to rename or select.
    if (reorder) {
      reorder.onLiftOrDrop()
      return
    }
    // In edit mode a tab opens for renaming, the same way a phrase cell does.
    if (onEdit) {
      onEdit()
      return
    }
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }, [onSelect, onEdit, reorder])
  const { active: dwelling, props } = useDwellControl(settings.actionDwellMs, handleActivate, {
    // A dwell landing mid-drag would lift a second tab out from under the one
    // already in the pointer's hand.
    disabled: reorder ? reorder.dragging : active && !onEdit,
  })

  const reorderLabel = reorder
    ? reorder.held
      ? `Holding ${label}. Dwell another category to drop it there, or here to put it back`
      : reorder.heldLabel
        ? `Drop ${reorder.heldLabel} here`
        : `Move ${label}`
    : null

  return (
    <div
      className={cx(
        'filter-tab',
        active && 'active',
        dwelling && 'dwelling',
        flash && 'flashed',
        onEdit && !reorder && 'edit-mode',
        reorder && 'reorderable',
        reorder?.held && 'is-held',
        // Somewhere the held tab could go — every other category, while one is
        // in the air.
        reorder?.heldLabel && 'is-drop-zone',
        reorder?.dropTarget && 'is-drop-target',
      )}
      style={dwellVar(settings.actionDwellMs)}
      role="tab"
      aria-selected={active}
      aria-label={reorderLabel ?? (onEdit ? `Rename category: ${label}` : label)}
      draggable={reorder ? true : undefined}
      onDragStart={reorder?.onDragStart}
      onDragOver={reorder && (e => {
        // Without this the browser refuses the drop outright.
        e.preventDefault()
        reorder.onDragOver()
      })}
      onDragEnd={reorder?.onDragEnd}
      onDrop={reorder && (e => {
        e.preventDefault()
        reorder.onDrop()
      })}
      {...props}
      tabIndex={0}
    >
      {label}
      <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
    </div>
  )
}

/** The controls at the end of the bar: add, sort, reorder. */
function FilterBarButton({ className, label, pressed, disabled, onActivate, children }: {
  className: string
  label: string
  pressed?: boolean
  disabled?: boolean
  onActivate: () => void
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled })
  return (
    <div
      className={cx('filter-tab filter-bar-btn', className, active && 'dwelling', pressed && 'is-on')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    >
      {children}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function ReorderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="7 8 4 5 1 8" /><line x1="4" y1="5" x2="4" y2="19" />
      <polyline points="17 16 20 19 23 16" /><line x1="20" y1="19" x2="20" y2="5" />
    </svg>
  )
}

function SortAlphaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="13" y2="6" /><line x1="4" y1="12" x2="11" y2="12" /><line x1="4" y1="18" x2="9" y2="18" />
      <polyline points="17 6 20 3 23 6" /><line x1="20" y1="3" x2="20" y2="21" />
    </svg>
  )
}

function FilterArrow({ onAction, repeat, label, children }: {
  onAction: () => void
  repeat?: boolean
  label: string
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onAction, { repeatMs: repeat ? 200 : undefined })
  return (
    <div
      className={cx('filter-arrow', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      {...props}
    >
      {children}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function FilterBar({
  categories,
  activeFilter,
  onSelect,
  onEditCategory,
  onAddCategory,
  reordering,
  isAlphabetical,
  onToggleReorder,
  onSortAlphabetically,
  onReorder,
  onLift,
}: {
  categories: { id: string; label: string }[]
  activeFilter: string
  onSelect: (id: string) => void
  onEditCategory?: (name: string) => void
  onAddCategory?: () => void
  /** All of the below are edit-mode only. */
  reordering?: boolean
  isAlphabetical?: boolean
  onToggleReorder?: () => void
  onSortAlphabetically?: () => void
  onReorder?: (from: string, to: string) => void
  /** Announced when a tab is picked up — the styling alone says nothing aloud. */
  onLift?: (name: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Which tab is in the air, whether picked up by dwell or by drag. Transient,
  // so it lives here rather than in the store.
  const [held, setHeld] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const scrollTo = useCallback((pos: number) => scrollRef.current?.scrollTo({ left: pos, behavior: 'smooth' }), [])
  const scrollBy = useCallback((dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' }), [])

  // Switching the mode off puts down whatever was in the air. Without this the
  // tab stays held across the round trip, and the next dwell drops the
  // forgotten one instead of lifting the tab under the pointer.
  const toggleReorder = useCallback(() => {
    setHeld(null)
    onToggleReorder?.()
  }, [onToggleReorder])

  const liftOrDrop = useCallback(
    (name: string) => {
      // Dwelling the tab already in hand puts it back where it was, which is
      // the only way out of a lift for someone with no other button to press.
      if (held === null) {
        setHeld(name)
        onLift?.(name)
      } else {
        if (held !== name) onReorder?.(held, name)
        setHeld(null)
      }
    },
    [held, onReorder, onLift],
  )

  const reorderPropsFor = (name: string): ReorderProps => ({
    held: held === name,
    heldLabel: held !== name ? held : null,
    dragging: dragging !== null,
    dropTarget: dropTarget === name && dragging !== name,
    onLiftOrDrop: () => liftOrDrop(name),
    onDragStart: () => {
      // Starting a drag abandons any dwell-lift, so only one is ever in flight.
      setHeld(null)
      setDragging(name)
    },
    onDragOver: () => setDropTarget(name),
    onDragEnd: () => {
      setDragging(null)
      setDropTarget(null)
    },
    onDrop: () => {
      if (dragging && dragging !== name) onReorder?.(dragging, name)
      setDragging(null)
      setDropTarget(null)
    },
  })

  return (
    <div className="filter-bar-wrap" role="tablist" aria-label="Filter phrases by category">
      <FilterArrow onAction={() => scrollTo(0)} label="Go to first category">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="6" x2="5" y2="18"/><polyline points="19 18 11 12 19 6"/>
        </svg>
      </FilterArrow>

      <FilterArrow onAction={() => scrollBy(-200)} repeat label="Scroll categories left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </FilterArrow>

      <div ref={scrollRef} className="filter-scroll">
        {categories.map(c => (
          <FilterTab
            key={c.id}
            label={c.label}
            active={activeFilter === c.id}
            onSelect={() => onSelect(c.id)}
            // "All" is not a category, so there is nothing to rename or move.
            onEdit={onEditCategory && c.id !== 'all' ? () => onEditCategory(c.id) : undefined}
            reorder={reordering && c.id !== 'all' ? reorderPropsFor(c.id) : undefined}
          />
        ))}
      </div>

      <FilterArrow onAction={() => scrollBy(200)} repeat label="Scroll categories right">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </FilterArrow>

      <FilterArrow onAction={() => scrollTo(999999)} label="Go to last category">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="19" y1="6" x2="19" y2="18"/><polyline points="5 6 13 12 5 18"/>
        </svg>
      </FilterArrow>

      {/* The category tools sit past the scroll controls rather than in with
          the tabs. Inside the scroller they were only reachable by scrolling to
          the end — the controls a user has to find are the ones that must not
          move.

          Adding and sorting share the first slot: adding a category mid-reorder
          would drop whatever is in the air, so the two are never offered at
          once, and the pair keeps a constant width either way. */}
      {(onAddCategory || onToggleReorder) && (
        <div className="filter-bar-tools">
          {reordering
            ? onSortAlphabetically && (
              <FilterBarButton
                className="sort-alpha-tab"
                label="Sort categories A to Z"
                disabled={isAlphabetical}
                onActivate={onSortAlphabetically}
              >
                <SortAlphaIcon />
              </FilterBarButton>
            )
            : onAddCategory && (
              <FilterBarButton className="add-category-tab" label="Add category" onActivate={onAddCategory}>
                <PlusIcon />
              </FilterBarButton>
            )}

          {onToggleReorder && (
            <FilterBarButton
              className="reorder-tab"
              label={reordering ? 'Done reordering categories' : 'Reorder categories'}
              pressed={reordering}
              onActivate={toggleReorder}
            >
              <ReorderIcon />
            </FilterBarButton>
          )}
        </div>
      )}
    </div>
  )
}

// ── Grid scroll bar ───────────────────────────────────────────────────────────

const SCROLL_STEP = 120

function ScrollBtn({ onAction, repeat, label, children }: {
  onAction: () => void
  repeat?: boolean
  label: string
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onAction, { repeatMs: repeat ? 180 : undefined })
  return (
    <div
      className={cx('scroll-btn', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      {...props}
    >
      <div className="scroll-btn-fill" key={active ? 'a' : 'i'} />
      {children}
    </div>
  )
}

function ToggleBtn({ on, onToggle, label, children }: {
  on: boolean
  onToggle: () => void
  label: string
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onToggle)
  return (
    <div
      className={cx('scroll-btn toggle-btn', on && 'active', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      aria-pressed={on}
      {...props}
    >
      <div className="scroll-btn-fill" key={active ? 'a' : 'i'} />
      {children}
    </div>
  )
}

function GridScrollBar({ gridRef, editMode, onToggleEdit, autoSpeak, onToggleAutoSpeak }: {
  gridRef: React.RefObject<HTMLElement | null>
  editMode: boolean
  onToggleEdit: () => void
  autoSpeak: boolean
  onToggleAutoSpeak: () => void
}) {
  const scrollTo = useCallback((pos: number) => gridRef.current?.scrollTo({ top: pos, behavior: 'smooth' }), [gridRef])
  const scrollBy = useCallback((dy: number) => gridRef.current?.scrollBy({ top: dy, behavior: 'smooth' }), [gridRef])

  return (
    <div className="grid-scrollbar">
      {/* Mode toggles — always visible above the scroll controls */}
      <ToggleBtn
        on={autoSpeak}
        onToggle={onToggleAutoSpeak}
        label={autoSpeak ? 'Turn off auto-speak' : 'Turn on auto-speak — speak phrases immediately'}
      >
        <AutoSpeakIcon />
      </ToggleBtn>

      <ToggleBtn
        on={editMode}
        onToggle={onToggleEdit}
        label={editMode ? 'Exit edit mode' : 'Edit phrases'}
      >
        <EditIcon />
      </ToggleBtn>

      <ScrollBtn onAction={() => scrollTo(0)} label="Scroll to top">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="6" x2="19" y2="6"/><polyline points="8 14 12 10 16 14"/>
        </svg>
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollBy(-SCROLL_STEP)} repeat label="Scroll up">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollBy(SCROLL_STEP)} repeat label="Scroll down">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollTo(999999)} label="Scroll to bottom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="18" x2="19" y2="18"/><polyline points="8 10 12 14 16 10"/>
        </svg>
      </ScrollBtn>
    </div>
  )
}

// ── Main app screen ───────────────────────────────────────────────────────────

function AACApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { settings, update } = useSettings()
  const [text, setText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [cursorPos, setCursorPos] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [store, setStore] = useState<PhraseStore>(loadPhraseStore)
  const [profile, setProfile] = useState<Profile>(loadProfile)
  const [editing, setEditing] = useState<
    { phrase: Phrase | null; isEmergency: boolean; initialText?: string } | null
  >(null)
  const [editingCategory, setEditingCategory] = useState<{ name: string | null } | null>(null)
  const [filling, setFilling] = useState<Phrase | null>(null)
  const [composerFocused, setComposerFocused] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gridRef = useRef<HTMLElement>(null)
  const showUndo = !text && history.length > 0

  const updateStore = useCallback((patch: Partial<PhraseStore>) => {
    setStore(s => {
      const next = { ...s, ...patch }
      savePhraseStore(next)
      return next
    })
  }, [])

  const flashToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(t => (t === message ? null : t)), 2200)
  }, [])

  // Overrides and user-authored phrases are re-parsed, so they behave like any
  // other phrase — and keep their stored id, which is what delete matches on.
  const buildPhrase = useCallback((id: string, raw: string, category: string): Phrase => {
    const segments = parseSegments(raw)
    return { id, text: compose(segments), segments, category }
  }, [])

  const handleProfileChange = useCallback((next: Profile) => {
    saveProfile(next)
    setProfile(next)
  }, [])

  // Slot options are resolved at parse time, so the table is rebuilt when the
  // user's own details change — a few milliseconds, and only on a profile edit.
  const tablePhrases = useMemo(() => buildPhrases(profile), [profile])

  const mainPhrases = useMemo(() => {
    // A phrase moved individually keeps that category; otherwise it follows any
    // rename applied to the category it came in.
    const shown = (id: string, source: string) =>
      store.categoryOverrides[id] ?? displayCategory(source, store.categoryRenames)
    const base = tablePhrases
      .filter(p => !store.hidden.includes(p.id))
      .map(p =>
        store.overrides[p.id]
          ? buildPhrase(p.id, store.overrides[p.id], shown(p.id, p.category))
          : { ...p, category: shown(p.id, p.category) },
      )
    const custom = store.custom
      .filter(c => c.category !== 'Emergency' && !store.hidden.includes(c.id))
      .map(c => buildPhrase(c.id, store.overrides[c.id] ?? c.text, shown(c.id, c.category)))
    return [...base, ...custom]
  }, [store, buildPhrase, tablePhrases])

  const emergencyPhrases = useMemo(() => {
    const base = EMERGENCY_PHRASES
      .filter(p => !store.hidden.includes(p.id))
      .map(p => (store.overrides[p.id] ? buildPhrase(p.id, store.overrides[p.id], p.category) : p))
    const custom = store.custom
      .filter(c => c.category === 'Emergency' && !store.hidden.includes(c.id))
      .map(c => buildPhrase(c.id, store.overrides[c.id] ?? c.text, 'Emergency'))
    return [...base, ...custom]
  }, [store, buildPhrase])

  const allCategories = useMemo(
    // User-created categories are listed even while empty, so one can be made
    // first and filled afterwards.
    () =>
      orderCategories(
        [...new Set([...mainPhrases.map(p => p.category), ...store.categories])],
        store.categoryOrder,
      ),
    [mainPhrases, store.categories, store.categoryOrder],
  )

  const phraseCountByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of mainPhrases) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    return counts
  }, [mainPhrases])

  // Derived from the live phrase list so user-added categories get a tab and
  // fully-hidden categories lose theirs.
  const categories = useMemo(
    () => [{ id: 'all', label: 'All' }, ...allCategories.map(c => ({ id: c, label: c }))],
    [allCategories],
  )

  // Deleting the last phrase in a category takes its tab away; fall back to
  // "All" rather than showing an empty grid under a tab that no longer exists.
  const effectiveFilter =
    activeFilter === 'all' || allCategories.includes(activeFilter) ? activeFilter : 'all'

  const openCategory = useCallback((name: string | null) => {
    cancelAllDwells()
    setEditingCategory({ name })
  }, [])

  const handleCategorySave = useCallback(
    (name: string) => {
      const current = editingCategory?.name ?? null
      if (current === null) {
        updateStore({ categories: [...new Set([...store.categories, name])] })
      } else {
        updateStore(renameCategory(store, current, name))
        setActiveFilter(f => (f === current ? name : f))
      }
      setEditingCategory(null)
    },
    [editingCategory, store, updateStore],
  )

  const handleCategoryDelete = useCallback(() => {
    const name = editingCategory?.name
    if (!name) return
    updateStore({
      categories: store.categories.filter(c => c !== name),
      categoryOrder: store.categoryOrder.filter(c => c !== name),
    })
    setActiveFilter(f => (f === name ? 'all' : f))
    setEditingCategory(null)
  }, [editingCategory, store, updateStore])

  // A drag or a drop writes the whole arrangement, so the first move away from
  // alphabetical captures the order the user could see at the time.
  const handleReorder = useCallback(
    (from: string, to: string) => updateStore({ categoryOrder: moveCategory(allCategories, from, to) }),
    [allCategories, updateStore],
  )

  const handleSortAlphabetically = useCallback(() => {
    updateStore({ categoryOrder: [] })
    flashToast('Categories sorted A–Z')
  }, [updateStore, flashToast])

  const openEdit = useCallback((phrase: Phrase | null, isEmergency = false) => {
    cancelAllDwells()
    setEditing({ phrase, isEmergency })
  }, [])

  // Adding from the message box carries whatever is composed there into the
  // editor, so a message worth keeping becomes a phrase without retyping it.
  // Deliberately not routed through `openEdit`: that one is on the edit context
  // every phrase cell reads, and making it depend on `text` would re-render the
  // whole grid on each keystroke.
  const openAddFromComposer = useCallback(() => {
    cancelAllDwells()
    setEditing({ phrase: null, isEmergency: false, initialText: text.trim() })
  }, [text])

  const handleSave = useCallback(
    (newText: string, newCategory: string) => {
      if (!editing) return
      const { phrase, isEmergency } = editing
      if (phrase === null) {
        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        updateStore({
          custom: [...store.custom, { id, text: newText, category: isEmergency ? 'Emergency' : newCategory }],
          categories: isEmergency ? store.categories : [...new Set([...store.categories, newCategory])],
        })
      } else {
        const patch: Partial<PhraseStore> = {
          overrides: { ...store.overrides, [phrase.id]: newText },
        }
        // The editor has always shown a category for existing phrases; until
        // now, changing it was silently discarded.
        if (!isEmergency && newCategory && newCategory !== phrase.category) {
          patch.categoryOverrides = { ...store.categoryOverrides, [phrase.id]: newCategory }
          patch.categories = [...new Set([...store.categories, newCategory])]
        }
        updateStore(patch)
      }
      setEditing(null)
    },
    [editing, store, updateStore],
  )

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

  const editCtx: EditCtxValue = useMemo(() => ({ editMode, openEdit }), [editMode, openEdit])

  // Word immediately left of cursor
  const currentWord = useMemo(() => {
    const before = text.slice(0, cursorPos)
    return before.match(/\S+$/)?.[0] ?? ''
  }, [text, cursorPos])

  const visiblePhrases = useMemo(() => {
    const pool =
      effectiveFilter === 'all' ? mainPhrases : mainPhrases.filter(p => p.category === effectiveFilter)
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
      return qi === q.length ? 1 : 0
    }

    return pool
      .map(p => ({ p, s: score(p.text) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.p)
  }, [effectiveFilter, currentWord, mainPhrases])

  const trackCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPos(e.currentTarget.selectionStart ?? 0)
  }, [])

  /** Replace the partial word left of the cursor with `phraseText`. */
  const insertPhrase = useCallback(
    (phraseText: string) => {
      const el = textareaRef.current
      const pos = el?.selectionStart ?? text.length
      const before = text.slice(0, pos)
      const after = text.slice(pos)
      const stripped = before.replace(/\S+$/, '')
      const separator = stripped.length > 0 && !stripped.endsWith(' ') ? ' ' : ''
      const inserted = stripped + separator + phraseText
      const newText = inserted + (after.startsWith(' ') || after === '' ? '' : ' ') + after

      setHistory(h => [...h, text])
      setText(newText)

      // Land the cursor on the first unfilled blank if there is one, so it can be
      // typed over; otherwise sit at the end of what was just inserted.
      const blankAt = inserted.indexOf(BLANK, stripped.length)
      setTimeout(() => {
        if (el) {
          if (blankAt >= 0) {
            el.selectionStart = blankAt
            el.selectionEnd = blankAt + BLANK.length
            el.focus()
          } else {
            el.selectionStart = el.selectionEnd = inserted.length
          }
        }
        setCursorPos(blankAt >= 0 ? blankAt : inserted.length)
      }, 0)
    },
    [text],
  )

  /**
   * Where a chosen phrase goes. In auto-speak it is spoken on the spot and the
   * message box is left alone, so the grid works as a one-tap talker; otherwise
   * it is composed into the message for the user to send when ready.
   */
  const deliverPhrase = useCallback(
    (phraseText: string) => {
      if (settings.autoSpeak) speak(phraseText, settings)
      else insertPhrase(phraseText)
    },
    [settings, insertPhrase],
  )

  const handleSelectPhrase = useCallback(
    (phrase: Phrase) => {
      // Fill-in-the-blank phrases ask for their wording first.
      if (hasChoices(phrase.segments)) {
        cancelAllDwells()
        setFilling(phrase)
        return
      }
      deliverPhrase(phrase.text)
    },
    [deliverPhrase],
  )

  const handleClearOrUndo = useCallback(() => {
    if (text) {
      setHistory(h => [...h, text])
      setText('')
    } else if (history.length) {
      setText(history[history.length - 1])
      setHistory(h => h.slice(0, -1))
    }
  }, [text, history])

  const handleCopy = useCallback(() => {
    if (!text) return
    navigator.clipboard
      .writeText(text)
      .then(() => flashToast('Copied to clipboard'))
      .catch(() => flashToast('Could not copy — clipboard unavailable'))
  }, [text, flashToast])

  const handleSpeak = useCallback(() => speak(text, settings), [text, settings])

  const toggleAutoSpeak = useCallback(() => {
    const next = !settings.autoSpeak
    update({ autoSpeak: next })
    // The button's lit state is the only other cue, and it sits in a narrow
    // rail — say plainly which way the mode just went.
    flashToast(next ? 'Auto-speak on — phrases speak immediately' : 'Auto-speak off — phrases build a message')
  }, [settings.autoSpeak, update, flashToast])

  const toggleMenu = useCallback(() => setMenuOpen(o => !o), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // Hover-and-hold on the message box, doing whichever of its two jobs applies.
  // Both were previously reachable only by clicking — the one input a
  // dwell-only user cannot produce.
  //
  //  * In edit mode it opens the editor; adding an ordinary phrase has no other
  //    entry point.
  //  * Otherwise it moves focus there, so the caret can be placed and typed at
  //    without a click.
  const handleComposerDwell = useCallback(() => {
    if (editMode) openAddFromComposer()
    else textareaRef.current?.focus()
  }, [editMode, openAddFromComposer])

  // Once the box holds focus there is nothing left for a hold to do, so it
  // stops arming — a pointer resting there while the user types should not keep
  // lighting up a progress bar.
  const composerDwell = useDwellControl(settings.actionDwellMs, handleComposerDwell, {
    disabled: !editMode && composerFocused,
  })

  return (
    <EditCtx.Provider value={editCtx}>
      <div className={cx('app', editMode && 'edit-mode')}>
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
            className={cx('text-display', composerDwell.active && 'dwelling')}
            style={dwellVar(settings.actionDwellMs)}
            aria-label={
              editMode
                ? text.trim()
                  ? 'Add this message as a new phrase'
                  : 'Add a new phrase'
                : 'Composed message'
            }
            value={text}
            onChange={e => {
              setText(e.target.value)
              trackCursor(e)
            }}
            onSelect={trackCursor}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onPointerEnter={composerDwell.props.onPointerEnter}
            onPointerLeave={composerDwell.props.onPointerLeave}
            onClick={e => {
              trackCursor(e)
              if (editMode) composerDwell.props.onClick()
            }}
            // The handler cancels Space so it cannot scroll the grid, and the
            // hook's own disabled check already stops that outside edit mode —
            // but that check reads a ref synced in an effect, and this is the
            // one surface where swallowing a space is unacceptable.
            onKeyDown={editMode ? composerDwell.props.onKeyDown : undefined}
            onKeyUp={trackCursor}
            placeholder={
              editMode
                ? 'Hold here to add a new phrase…'
                : settings.autoSpeak
                  ? 'Auto-speak is on — phrases are spoken, not collected here'
                  : 'Dwell on a phrase or type…'
            }
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
          <FilterBar
            categories={categories}
            activeFilter={effectiveFilter}
            onSelect={setActiveFilter}
            onEditCategory={editMode ? openCategory : undefined}
            onAddCategory={editMode ? () => openCategory(null) : undefined}
            reordering={editMode && reordering}
            isAlphabetical={store.categoryOrder.length === 0}
            onToggleReorder={editMode ? () => setReordering(r => !r) : undefined}
            onSortAlphabetically={editMode ? handleSortAlphabetically : undefined}
            onReorder={editMode ? handleReorder : undefined}
            onLift={name => flashToast(`Holding ${name} — dwell where it should go`)}
          />
        )}

        {/* ── Phrase grid + scroll controls ── */}
        <div className="grid-area">
          <main ref={gridRef} className="grid-wrapper">
            <div className="phrase-grid" role="group" aria-label="Phrases">
              {visiblePhrases.map(phrase => (
                <PhraseCell key={phrase.id} phrase={phrase} onSelect={handleSelectPhrase} />
              ))}
            </div>
          </main>
          <GridScrollBar
            gridRef={gridRef}
            editMode={editMode}
            onToggleEdit={() => {
              setEditMode(m => !m)
              // Reordering is a mode within edit mode; leaving the outer one
              // should not leave it armed for next time.
              setReordering(false)
            }}
            autoSpeak={settings.autoSpeak}
            onToggleAutoSpeak={toggleAutoSpeak}
          />
        </div>

        {/* ── Emergency bar — always visible at bottom ── */}
        <EmergencyBar phrases={emergencyPhrases} />

        {/* ── Top panel ── */}
        <TopPanel
          open={menuOpen}
          user={user}
          onClose={closeMenu}
          onSignOut={onSignOut}
          profile={profile}
          onProfileChange={handleProfileChange}
        />

        <DwellCursor />

        <div className="toast-region" role="status" aria-live="polite">
          {toast && <div className="toast">{toast}</div>}
        </div>

        {filling && (
          <SlotPicker
            phrase={filling}
            onComplete={t => {
              setFilling(null)
              deliverPhrase(t)
            }}
            onCancel={() => setFilling(null)}
          />
        )}

        {editingCategory !== null && (
          <CategoryModal
            name={editingCategory.name}
            phraseCount={editingCategory.name ? (phraseCountByCategory.get(editingCategory.name) ?? 0) : 0}
            existing={allCategories}
            onSave={handleCategorySave}
            onDelete={handleCategoryDelete}
            onClose={() => setEditingCategory(null)}
          />
        )}

        {editing !== null && (
          <EditModal
            phrase={editing.phrase}
            isEmergency={editing.isEmergency}
            initialText={editing.initialText}
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

// ── LegalPage ─────────────────────────────────────────────────────────────────
// Served at /privacy and /terms. Standalone rather than a panel: these are
// linked from the sign-in page and given to Google and Meta as the app's
// published policy URLs, so they must render without an account and without
// any of the app's state.

function LegalPage({ doc }: { doc: ProseDocument }) {
  return (
    <div className="legal-page">
      <article className="legal-measure">
        <a className="legal-back" href="/">← Back to DwellSpeak</a>
        <h1 className="legal-title">{doc.title}</h1>
        <p className="legal-updated">Last updated {doc.updated}</p>
        {doc.intro && <p className="legal-intro">{doc.intro}</p>}
        <ProseSections sections={doc.sections} />
        <p className="help-legal-links">
          <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> ·{' '}
          <a href="/">DwellSpeak</a>
        </p>
      </article>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

const USER_KEY = 'dwellspeak_user'

function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

export default function App() {
  // Legal pages are plain documents at their own URLs. Two leaf pages reached
  // by real links need no router and no history handling.
  const legalDoc = legalDocumentFor(window.location.pathname)

  const [user, setUser] = useState<User | null>(loadUser)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const screen: Screen = user ? 'app' : 'signin'

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(s => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const handleSignIn = useCallback((u: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    setUser(u)
  }, [])

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  const ctx = useMemo(() => ({ settings, update }), [settings, update])

  if (legalDoc) return <LegalPage doc={legalDoc} />

  return (
    <SettingsCtx.Provider value={ctx}>
      {screen === 'signin' ? <SignInPage onSignIn={handleSignIn} /> : <AACApp user={user!} onSignOut={handleSignOut} />}
    </SettingsCtx.Provider>
  )
}

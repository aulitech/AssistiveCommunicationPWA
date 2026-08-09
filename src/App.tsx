import { useState, useRef, useCallback, useEffect, useMemo, memo, createContext, useContext } from 'react'
import { SIGN_IN, SignInCancelled, configuredProviders, type Provider } from './auth'
import { HELP_SECTIONS } from './help'
import { legalDocumentFor } from './legal'
import type { ProseDocument, ProseSection } from './prose'
import { useDwellControl, cancelAllDwells, RestingContext } from './dwell'
import { speak, subscribeVoices } from './speech'
import {
  buildPhrases,
  BLANK,
  compose,
  hasChoices,
  parseSegments,
  plainPhrase,
  type Phrase,
  type Profile,
} from './phrases'
import {
  DEFAULT_SETTINGS,
  clearUser,
  loadPhraseStore,
  loadProfile,
  loadSettings,
  loadUser,
  saveProfile,
  savePhraseStore,
  saveSettings,
  saveUser,
  type PhraseStore,
  type Settings,
  type User,
} from './store'
import {
  applyBackup,
  backupFilename,
  buildBackup,
  canReplace,
  describeBackup,
  parseBackup,
  serializeBackup,
  summarize,
  type AppState,
  type Backup,
  type BackupSummary,
  type ImportMode,
} from './backup'

// ── Types ────────────────────────────────────────────────────────────────────

type Screen = 'signin' | 'app'

// ── Small helpers ─────────────────────────────────────────────────────────────

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' ')

const dwellVar = (ms: number) => ({ '--dwell-duration': `${ms}ms` }) as React.CSSProperties

// ── Settings ─────────────────────────────────────────────────────────────────

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

// ── Categories ────────────────────────────────────────────────────────────────

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

// The Peri mark. No backing plate here — it sits on the page background, which
// is the same dark the icon files use behind it. The paths are duplicated in
// public/icon.svg and public/icon-maskable.svg, which are static files and
// cannot import them.
function AppLogoIcon() {
  return (
    <svg viewBox="0 0 1970.57 1903.4" xmlns="http://www.w3.org/2000/svg" fill="var(--brand)" aria-hidden="true">
      <path d="M1086.39,1256.11c-2.28-1.87-10.82-6.34-13.73-7.28-20.8-6.68-113.08-5.44-138.64-3.44-18.28,1.43-30.5,5.25-41.78,20.19-26.16,34.63-46.68,88.62-71.48,126.42-10.93,16.66-18.83,27.33-40.51,29.46-41.59,4.08-130.19,3.75-172.08-.02-13.74-1.23-22.82-6.03-32.89-15.09-38.55-49-95.26-92.49-132.99-140.89-10.4-13.34-16.83-28.88-9.54-45.55,161.34-282.15,322.69-565.08,489.36-844.03,8.52-6.89,17.31-10.52,28.24-11.74,18.67-2.08,90.8-2.5,105.78,3.65,6.83,2.81,15.23,10.35,19.77,16.22l478.57,826.82c15.29,34.51,1.16,46.32-20.61,70.63-38.88,43.42-82.35,83.17-120.95,126.94l-27.01,12.97c-40.34,3.89-118.73,5.07-173.99.07-8.33-.75-17.26-3.13-24.3-7.68-23-14.89-69.65-115.95-90.94-144.95-1.8-2.46-8.66-11.38-10.27-12.71ZM706.55,1256.81c35.98-43.88,61.65-102.66,96.64-146.24,9.93-12.37,18.05-19.43,34.86-21.11l327.05.96c12.01,3.04,21.06,12.01,28.7,21.28,32.69,39.64,58.52,97.38,91.48,136.41,39.16,46.37,105.38-7.62,78.35-56.35-113.31-192.14-220.73-388.28-337.52-578.05-17.2-15.1-38.14-12.97-56.41-1.29l-338.24,580.32c-24.39,42.42,36.43,97.43,75.09,64.08Z"/>
      <path d="M1868.2,1237.94c10.81-1.44,22.13,1.85,31.15,7.85,11.3,7.53,61.64,56.3,66.8,67.14,6.97,14.64,5.2,27.01-1.82,41.16-113.43,117.45-224.57,238.02-339.48,354.2-35.44,35.83-58.68,74.72-112.93,74.99-133.66.67-300.01-7.81-445.63.18-50.3,6.43-68.63,55.61-107.36,82.55-152.45,106.02-354.01-28.98-316.73-210.77,28.1-137.06,187.55-203.25,306.73-130.76,40.31,24.52,60.37,71.26,109.37,78.54l423.07-.22,28.87-11.12c115.69-109.8,221.96-229.89,335.42-342.27,5.59-5.22,14.96-10.47,22.54-11.48ZM895.39,1698.57c0-29.72-24.1-53.82-53.82-53.82s-53.82,24.1-53.82,53.82,24.1,53.82,53.82,53.82,53.82-24.1,53.82-53.82Z"/>
      <path d="M580.84,174.58c228.66-12.88,300.9,297.2,100.78,388.63-53.81,24.59-103.67,6.87-141.16,60.75-100.06,189.51-227.77,372.36-325.39,562.2-22.93,44.59-24.96,76.06,8.4,116.21,81.08,97.6,183.65,189.18,268.84,284.91,18.59,20.88,41.57,40.26,27.35,71.38-5.1,11.16-65.08,66.86-76.78,71.16-30.3,11.12-46.71-10.5-65.6-29.51-121.74-122.53-233.33-255.94-354.82-378.85-19.75-23.44-27.06-51.52-19.58-81.59,129.81-244.02,279.62-477.79,409.87-721.61,10.13-42.97-18.18-78.97-21.38-121.43-8.57-113.49,74.57-215.78,189.47-222.25ZM648.64,378.01c0-29.67-24.05-53.72-53.72-53.72s-53.72,24.05-53.72,53.72,24.05,53.72,53.72,53.72,53.72-24.05,53.72-53.72Z"/>
      <path d="M792.61.53l423.43-.53c44.31,3.75,60.13,30.67,81.73,64.21,142.98,222.05,267.44,456.65,411.06,678.44,30.36,35.45,59.18,28.26,99.45,38.49,140.06,35.56,198.32,205.97,110.33,321.34-123.14,161.45-380.51,62.63-365.85-141.94,2.44-34.08,23.44-68.3,24.09-97.98.82-37.59-45.13-100.94-65.17-134.66-108.65-182.79-219.66-365.05-332.91-544.68-14.87-12.84-32.96-22.63-52.8-23.17-83.17-2.27-204.49,2.48-315.91.05-19.77-.43-44.14-11.88-48.43-33.54-2.52-12.76-1.9-85.81,1.44-97.59,3.85-13.57,16.77-23.78,29.55-28.42ZM1809.89,978.56c0-29.61-24.01-53.62-53.62-53.62s-53.62,24-53.62,53.62,24.01,53.62,53.62,53.62,53.62-24,53.62-53.62Z"/>
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

// ── BackupPanel ───────────────────────────────────────────────────────────────
// Everything a user has made of Peri lives in this browser and nowhere else, so
// this is both the backup and the only way to move a board between devices or
// hand one to somebody else.

function BackupButton({ label, kind, onActivate, disabled }: {
  label: string
  kind: 'primary' | 'plain' | 'danger'
  onActivate: () => void
  disabled?: boolean
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled })
  return (
    <div
      className={cx('backup-btn', kind, active && 'dwelling', disabled && 'is-disabled')}
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

function BackupScopeRow({ label, sublabel, selected, onSelect }: {
  label: string
  sublabel?: string
  selected: boolean
  onSelect: () => void
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onSelect)
  return (
    <div
      className={cx('backup-scope-row', selected && 'is-selected', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      <span className="backup-check" aria-hidden="true">
        {selected && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="backup-scope-label">{label}</span>
      {sublabel && <span className="backup-scope-count">{sublabel}</span>}
    </div>
  )
}

function BackupPanel({ store, profile, categories, categoryById, onRestore }: {
  store: PhraseStore
  profile: Profile
  /** Every category that can be exported on its own, in the order shown. */
  categories: string[]
  categoryById: Map<string, string>
  onRestore: (next: AppState, message: string) => void
}) {
  const { settings } = useSettings()
  // Null is "everything", which is not the same as every category ticked: only
  // a whole-app backup carries the details and settings, and only a whole-app
  // backup may be restored by replacing.
  const [scope, setScope] = useState<string[] | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<{ backup: Backup; summary: BackupSummary } | null>(null)

  const backup = useMemo(
    () => buildBackup({ store, profile, settings, categoryById, scope }),
    [store, profile, settings, categoryById, scope],
  )
  const summary = useMemo(() => summarize(backup), [backup])
  // What "Everything" would hold, whether or not it is the current choice — it
  // is the line under the option, so it has to stand for the option and not for
  // whatever categories happen to be ticked.
  const everything = useMemo(
    () => (scope === null ? summary : summarize(buildBackup({ store, profile, settings, categoryById }))),
    [scope, summary, store, profile, settings, categoryById],
  )

  const toggleCategory = useCallback((name: string) => {
    setStatus(null)
    setScope(current => {
      if (current === null) return [name]
      const next = current.includes(name) ? current.filter(c => c !== name) : [...current, name]
      // Unticking the last one means "not a subset any more", which is the whole
      // app — otherwise the panel would sit in a state that exports nothing.
      return next.length === 0 ? null : next
    })
  }, [])

  const download = useCallback(() => {
    const json = serializeBackup(backup)
    const name = backupFilename(backup)
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
      setError(null)
      setStatus(`Saved as ${name}`)
    } catch {
      setError('Peri could not save the file. Copy the backup instead.')
    }
  }, [backup])

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(serializeBackup(backup))
      .then(() => {
        setError(null)
        setStatus('Backup copied — paste it somewhere safe')
      })
      .catch(() => setError('Peri could not reach the clipboard. Save the file instead.'))
  }, [backup])

  const load = useCallback((text: string) => {
    const result = parseBackup(text)
    if (!result.ok) {
      setIncoming(null)
      setStatus(null)
      setError(result.error)
      return
    }
    const parsed = summarize(result.backup)
    if (parsed.empty) {
      setIncoming(null)
      setStatus(null)
      setError('That backup is empty — there is nothing in it to restore.')
      return
    }
    setError(null)
    setStatus(null)
    setIncoming({ backup: result.backup, summary: parsed })
  }, [])

  const readFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Chosen and then cleared, so picking the same file twice in a row still
      // fires a change event.
      e.target.value = ''
      if (!file) return
      file
        .text()
        .then(load)
        .catch(() => setError('Peri could not read that file.'))
    },
    [load],
  )

  const paste = useCallback(() => {
    navigator.clipboard
      ?.readText?.()
      .then(load)
      .catch(() => setError('Peri could not reach the clipboard. Choose a backup file instead.'))
  }, [load])

  const restore = useCallback(
    (mode: ImportMode) => {
      if (!incoming) return
      const next = applyBackup(incoming.backup, { store, profile, settings }, mode)
      onRestore(next, mode === 'replace' ? 'Backup restored' : 'Backup merged in')
    },
    [incoming, store, profile, settings, onRestore],
  )

  return (
    <div className="backup-panel">
      <ScrollPane className="backup-scroller" paneClassName="backup-body" step={120}>
        <p className="backup-note">
          Your phrases live in this browser and nowhere else. A backup carries everything you
          changed — what you added, reworded, moved or removed, your details and your settings.
          The phrases Peri came with are already in the app, so they are not in the file.
        </p>

        <span className="setting-label backup-heading">What to save</span>
        <div className="backup-scope" role="group" aria-label="What to save">
          <BackupScopeRow
            label="Everything"
            sublabel={describeBackup(everything)}
            selected={scope === null}
            onSelect={() => {
              setStatus(null)
              setScope(null)
            }}
          />
          {categories.map(name => (
            <BackupScopeRow
              key={name}
              label={name}
              selected={scope !== null && scope.includes(name)}
              onSelect={() => toggleCategory(name)}
            />
          ))}
        </div>

        {scope !== null && <p className="backup-summary">{describeBackup(summary)}</p>}

        <div className="backup-actions">
          <BackupButton kind="primary" label="Save a file" onActivate={download} disabled={summary.empty} />
          <BackupButton kind="plain" label="Copy" onActivate={copy} disabled={summary.empty} />
        </div>

        <span className="setting-label backup-heading">Bring a backup in</span>

        {incoming ? (
          <div className="backup-incoming" role="group" aria-label="Restore this backup">
            <p className="backup-summary">
              {incoming.backup.scope
                ? `${incoming.backup.scope.join(', ')} — `
                : 'Whole backup — '}
              {describeBackup(incoming.summary)}.
            </p>
            <div className="backup-actions">
              <BackupButton kind="primary" label="Add to what's here" onActivate={() => restore('merge')} />
              {canReplace(incoming.backup) && (
                <BackupButton kind="danger" label="Replace everything" onActivate={() => restore('replace')} />
              )}
              <BackupButton kind="plain" label="Cancel" onActivate={() => setIncoming(null)} />
            </div>
            <p className="backup-note">
              Adding never takes a phrase away. Replacing makes this device match the file exactly,
              including anything the backup had removed.
            </p>
          </div>
        ) : (
          <div className="backup-actions">
            {/* A real <input> rather than a dwell button that clicks one: the
                file picker belongs to the browser and only opens for a genuine
                click or an Enter on the input itself. Filling the label with it
                means a click anywhere on the button opens it, and a keyboard
                lands on it in the ordinary way. Clipboard is the way in for
                anyone whose dwell never produces a click at all. */}
            <label className="backup-btn plain backup-file">
              <input
                type="file"
                className="backup-file-input"
                accept="application/json,.json"
                aria-label="Choose a backup file"
                onChange={readFile}
              />
              Choose a file
            </label>
            <BackupButton kind="plain" label="Paste a backup" onActivate={paste} />
          </div>
        )}

        {error && <p className="backup-error" role="alert">{error}</p>}
        {status && <p className="backup-status" role="status">{status}</p>}
      </ScrollPane>
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
          <h2 className="help-title">Using Peri</h2>
          <ProseSections sections={HELP_SECTIONS} />
          <p className="help-legal-links">
            <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
          </p>
        </div>
      </ScrollPane>
    </div>
  )
}

type PanelView = 'menu' | 'settings' | 'profile' | 'backup' | 'help'

function TopPanel({ open, user, onClose, onSignOut, profile, onProfileChange, store, categories, categoryById, onRestore }: {
  open: boolean
  user: User
  onClose: () => void
  onSignOut: () => void
  profile: Profile
  onProfileChange: (p: Profile) => void
  store: PhraseStore
  categories: string[]
  categoryById: Map<string, string>
  onRestore: (next: AppState, message: string) => void
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
            {view === 'backup' && (
              <BackupPanel
                store={store}
                profile={profile}
                categories={categories}
                categoryById={categoryById}
                onRestore={onRestore}
              />
            )}
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
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              label="Backup & sharing"
              sublabel="Save your phrases, or bring some in"
              onSelect={() => setView('backup')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
              label="Help"
              sublabel="How to use Peri"
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

/* The two arrangements, drawn as what they are. Alphabetical is tidy lines
   descending in length under an A-to-Z arrow; the user's own is the same lines
   jumbled, beside a grip. Neither can be mistaken for the reorder button's
   opposing arrows, which sits right next to them. */

function SortAlphaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="13" y2="6" /><line x1="4" y1="12" x2="11" y2="12" /><line x1="4" y1="18" x2="9" y2="18" />
      <polyline points="17 6 20 3 23 6" /><line x1="20" y1="3" x2="20" y2="21" />
    </svg>
  )
}

function CustomOrderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="11" y2="6" /><line x1="4" y1="12" x2="15" y2="12" /><line x1="4" y1="18" x2="8" y2="18" />
      {[6, 12, 18].map(y => (
        <g key={y}>
          <circle cx="18.5" cy={y} r="1.4" fill="currentColor" stroke="none" />
          <circle cx="22" cy={y} r="1.4" fill="currentColor" stroke="none" />
        </g>
      ))}
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
  canRestoreOrder,
  onToggleReorder,
  onToggleSort,
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
  /** Which arrangement is on show. */
  isAlphabetical?: boolean
  /** Whether an arrangement of the user's own exists to switch back to. */
  canRestoreOrder?: boolean
  onToggleReorder?: () => void
  onToggleSort?: () => void
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
            ? onToggleSort && (
              <FilterBarButton
                className="sort-order-tab"
                // The green fill says which arrangement is on, so the icon and
                // the name say it too rather than leaving colour to carry it.
                // Both then name the switch, since neither state is "off".
                label={
                  isAlphabetical
                    ? 'Sorted A to Z. Switch to your own order'
                    : 'Your own order. Switch to A to Z'
                }
                pressed={isAlphabetical}
                // Nothing to switch to until there is an arrangement of their
                // own to come back to.
                disabled={isAlphabetical && !canRestoreOrder}
                onActivate={onToggleSort}
              >
                {isAlphabetical ? <SortAlphaIcon /> : <CustomOrderIcon />}
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

// ── Rest ──────────────────────────────────────────────────────────────────────

/**
 * The only control that stays live while the app is resting — everything else
 * is switched off around it, so this has to be the way back. Its own dwell
 * therefore never depends on the resting state.
 *
 * A bare lozenge on the top edge of the message box: no icon, no word. The
 * name lives only in `aria-label`, and the state is told by the whole app
 * dimming behind it rather than by anything the control itself can say.
 */
function RestButton({ resting, onToggle }: { resting: boolean; onToggle: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onToggle, { ignoresRest: true })
  return (
    <div
      className={cx('rest-btn', resting && 'is-resting', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-pressed={resting}
      aria-label={resting ? 'Resume. Switch dwell back on' : 'Rest. Switch dwell off everywhere but here'}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
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
  const [resting, setResting] = useState(false)
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
        // The custom arrangement is kept while A–Z is showing; it just is not
        // the one being applied.
        store.categorySort === 'custom' ? store.categoryOrder : [],
      ),
    [mainPhrases, store.categories, store.categoryOrder, store.categorySort],
  )

  // The category every phrase belongs to, hidden ones included. Exporting a few
  // categories needs a category for phrases that are not on screen: one the user
  // removed still belongs to the category it came from, and that is the only way
  // to tell whether their removal is part of what they asked to export.
  const categoryById = useMemo(() => {
    const map = new Map<string, string>()
    const shown = (id: string, source: string) =>
      store.categoryOverrides[id] ?? displayCategory(source, store.categoryRenames)
    for (const p of tablePhrases) map.set(p.id, shown(p.id, p.category))
    for (const p of EMERGENCY_PHRASES) map.set(p.id, 'Emergency')
    for (const c of store.custom) map.set(c.id, shown(c.id, c.category))
    return map
  }, [tablePhrases, store.categoryOverrides, store.categoryRenames, store.custom])

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

  const backupCategories = useMemo(() => [...allCategories, 'Emergency'], [allCategories])

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

  // A drag or a drop writes the whole arrangement, so a move made while A–Z is
  // showing captures the order the user could see at the time — and replaces
  // whatever they had arranged before, which is what building a new one means.
  const handleReorder = useCallback(
    (from: string, to: string) =>
      updateStore({ categoryOrder: moveCategory(allCategories, from, to), categorySort: 'custom' }),
    [allCategories, updateStore],
  )

  // One control, toggling between the two arrangements. The custom one is left
  // in the store either way, so going to A–Z and back is not a way to lose it.
  const handleToggleSort = useCallback(() => {
    const toAlpha = store.categorySort === 'custom'
    updateStore({ categorySort: toAlpha ? 'alpha' : 'custom' })
    flashToast(toAlpha ? 'Categories sorted A–Z' : 'Your own category order restored')
  }, [store.categorySort, updateStore, flashToast])

  // An import lands in one go rather than a field at a time: the three stores
  // are written together and the panel closes onto the result, so there is no
  // moment where the grid is showing half of someone's backup.
  const handleRestore = useCallback(
    (next: AppState, message: string) => {
      updateStore(next.store)
      handleProfileChange(next.profile)
      update(next.settings)
      setMenuOpen(false)
      flashToast(message)
    },
    [updateStore, handleProfileChange, update, flashToast],
  )

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

  // Anything part-way through when rest begins would otherwise complete after
  // it, which is the one thing resting is supposed to prevent.
  const toggleRest = useCallback(() => {
    cancelAllDwells()
    setResting(r => !r)
  }, [])

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
     <RestingContext.Provider value={resting}>
      <div className={cx('app', editMode && 'edit-mode', resting && 'resting')}>
        {/* ── Topbar ── */}
        <header className="topbar">
          {/* Straddling the top edge of the message box — the middle of the
              screen's top, where a gaze on its way anywhere passes. Costs the
              grid no height at all. */}
          <RestButton resting={resting} onToggle={toggleRest} />

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
            isAlphabetical={store.categorySort === 'alpha'}
            canRestoreOrder={store.categoryOrder.length > 0}
            onToggleReorder={editMode ? () => setReordering(r => !r) : undefined}
            onToggleSort={editMode ? handleToggleSort : undefined}
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
          store={store}
          // Emergency has no tab of its own, so it would otherwise be the one
          // set of phrases that could not be exported on its own.
          categories={backupCategories}
          categoryById={categoryById}
          onRestore={handleRestore}
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
     </RestingContext.Provider>
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
        <a className="legal-back" href="/">← Back to Peri</a>
        <h1 className="legal-title">{doc.title}</h1>
        <p className="legal-updated">Last updated {doc.updated}</p>
        {doc.intro && <p className="legal-intro">{doc.intro}</p>}
        <ProseSections sections={doc.sections} />
        <p className="help-legal-links">
          <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> ·{' '}
          <a href="/">Peri</a>
        </p>
      </article>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

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
    saveUser(u)
    setUser(u)
  }, [])

  const handleSignOut = useCallback(() => {
    clearUser()
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

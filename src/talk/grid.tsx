
// The phrase grid and the rail of controls beside it.
//
// The grid renders every phrase in the table — a couple of thousand cells — so
// the cell is memoised and takes callbacks that do not change between renders.

import { memo, useCallback, useRef, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { useEdit } from '../ui/edit-mode'
import { hasChoices, type Phrase } from '../core/phrases'
import { AutoSpeakIcon, EditIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'

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

/**
 * The grid and the rail beside it. They are one component because the rail
 * scrolls the grid, and the reference between them is nobody else's business.
 */
export function PhraseGrid({ phrases, emptyMessage, onSelect, editMode, onToggleEdit, autoSpeak, onToggleAutoSpeak }: {
  phrases: Phrase[]
  /** Shown when there is nothing to show, for filters that can legitimately be empty. */
  emptyMessage?: string
  onSelect: (phrase: Phrase) => void
  editMode: boolean
  onToggleEdit: () => void
  autoSpeak: boolean
  onToggleAutoSpeak: () => void
}) {
  const gridRef = useRef<HTMLElement>(null)
  return (
    <div className="grid-area">
      <main ref={gridRef} className="grid-wrapper">
        <div className="phrase-grid" role="group" aria-label="Phrases">
          {phrases.map(phrase => (
            <PhraseCell key={phrase.id} phrase={phrase} onSelect={onSelect} />
          ))}
        </div>
        {phrases.length === 0 && emptyMessage && <p className="grid-empty">{emptyMessage}</p>}
      </main>
      <GridScrollBar
        gridRef={gridRef}
        editMode={editMode}
        onToggleEdit={onToggleEdit}
        autoSpeak={autoSpeak}
        onToggleAutoSpeak={onToggleAutoSpeak}
      />
    </div>
  )
}

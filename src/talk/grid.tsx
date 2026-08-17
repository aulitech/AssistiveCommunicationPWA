
// The phrase grid and the rail of controls beside it.
//
// The grid renders every phrase in the table — a couple of thousand cells — so
// the cell is memoised and takes callbacks that do not change between renders.

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { useEdit } from '../ui/edit-mode'
import { stripMarkdown } from '../core/markdown'
import { hasChoices, type Phrase } from '../core/phrases'
import { needsMore, windowSize } from '../core/virtual'
import { cx, dwellVar } from '../ui/style'
import { PhraseText } from './phrase-text'

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
  // What the cell says, not how it is marked up: a screen reader announcing
  // "asterisk asterisk help" is the same failure as the app speaking it.
  const spoken = stripMarkdown(phrase.text)

  return (
    <div
      className={cx('phrase-cell', active && 'dwelling', flash && 'selected', editMode && 'edit-mode')}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      aria-label={editMode ? `Edit phrase: ${spoken}` : fillable ? `${spoken} — choose wording` : spoken}
      {...props}
    >
      <span className="phrase-cell-text">
        <PhraseText segments={phrase.segments} />
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
  const { active, props } = useDwellControl(settings.actionDwellMs, onAction, {
    repeatMs: repeat ? settings.repeatDelayMs : undefined,
  })
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

/**
 * Scrolling only. The two mode toggles used to sit at the top of this rail; they
 * are in the topbar now, either side of Rest, which is the third of the three
 * and was already there.
 */
function GridScrollBar({ gridRef, onBeforeJumpToBottom }: {
  gridRef: React.RefObject<HTMLElement | null>
  /** Renders the rest of the list, so the jump has somewhere to land. */
  onBeforeJumpToBottom: () => void
}) {
  const scrollTo = useCallback((pos: number) => gridRef.current?.scrollTo({ top: pos, behavior: 'smooth' }), [gridRef])
  const scrollBy = useCallback((dy: number) => gridRef.current?.scrollBy({ top: dy, behavior: 'smooth' }), [gridRef])

  return (
    <div className="grid-scrollbar">
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
      <ScrollBtn
        onAction={() => {
          onBeforeJumpToBottom()
          scrollTo(999999)
        }}
        label="Scroll to bottom"
      >
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
 *
 * Only the first `shown` cells are rendered — see `core/virtual.ts` for why the
 * window grows from the top rather than sliding.
 */
export function PhraseGrid({ phrases, emptyMessage, onSelect }: {
  phrases: Phrase[]
  /** Shown when there is nothing to show, for filters that can legitimately be empty. */
  emptyMessage?: string
  onSelect: (phrase: Phrase) => void
}) {
  const gridRef = useRef<HTMLElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  /** Cells one measured windowful holds. Null until something has been laid out. */
  const [step, setStep] = useState<number | null>(null)
  /** How many to render. Null renders the lot, which is the unmeasured answer. */
  const [shown, setShown] = useState<number | null>(null)

  // A different list starts again from one windowful. Adjusting during render
  // rather than in an effect avoids a pass showing the old window over the new
  // list — and `step` is state, so this reads nothing it should not.
  const [forList, setForList] = useState(phrases)
  if (forList !== phrases) {
    setForList(phrases)
    setShown(step)
  }

  const visible = shown === null || shown >= phrases.length ? phrases : phrases.slice(0, shown)

  // Measures, then grows until the cells fill the viewport. That second part is
  // what makes it safe: however far off the measurement is, the grid keeps
  // adding until it is scrollable, so no phrase can end up out of reach. It
  // settles because `shown` only rises and `needsMore` stops at the end.
  useEffect(() => {
    const wrapper = gridRef.current
    const grid = innerRef.current
    if (!wrapper || !grid) return
    const measured = measure(wrapper, grid)
    if (measured === null) return
    if (measured !== step) setStep(measured)
    if (shown === null) setShown(measured)
    else if (needsMore(wrapper, shown, phrases.length)) setShown(shown + measured)
  }, [phrases, shown, step])

  // Scrolling towards the end asks for more. The same growth, on the one trigger
  // a render does not give us.
  useEffect(() => {
    const wrapper = gridRef.current
    if (!wrapper) return
    const onScroll = () => {
      const grid = innerRef.current
      if (!grid) return
      const measured = measure(wrapper, grid)
      if (measured === null) return
      setShown(current => {
        // A scroll can be the first thing that finds anything to measure, so it
        // establishes the window as well as growing it.
        if (current === null) return measured
        return needsMore(wrapper, current, phrases.length) ? current + measured : current
      })
    }
    wrapper.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(wrapper)
    return () => {
      wrapper.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [phrases.length])

  // The rail's bottom jump has to have somewhere to land. The count rather than
  // null, because null means "not measured yet" and the effect would answer that
  // by measuring and windowing again on the very next pass.
  const showEverything = useCallback(() => setShown(phrases.length), [phrases.length])

  return (
    <div className="grid-area">
      <main ref={gridRef} className="grid-wrapper">
        <div ref={innerRef} className="phrase-grid" role="group" aria-label="Phrases">
          {visible.map(phrase => (
            <PhraseCell key={phrase.id} phrase={phrase} onSelect={onSelect} />
          ))}
        </div>
        {phrases.length === 0 && emptyMessage && <p className="grid-empty">{emptyMessage}</p>}
      </main>
      <GridScrollBar gridRef={gridRef} onBeforeJumpToBottom={showEverything} />
    </div>
  )
}

/**
 * Columns come from the grid's own computed style rather than from a copy of the
 * breakpoints, so the two cannot drift. Both this and the row height read as
 * nothing until something has been laid out, which `windowSize` turns into
 * "render everything".
 */
function measure(wrapper: HTMLElement | null, grid: HTMLElement | null): number | null {
  if (!wrapper || !grid) return null
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
  const cell = grid.firstElementChild
  const rowHeight = cell instanceof HTMLElement ? cell.offsetHeight : 0
  return windowSize(wrapper, { columns, rowHeight })
}

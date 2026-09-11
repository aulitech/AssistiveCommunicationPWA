// The phrase grid and the rail of controls beside it.
//
// The grid renders every phrase in the table — a couple of thousand cells — so
// the cell is memoised and takes callbacks that do not change between renders.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { holdDwells, onDwellActivation, useDwellControl } from '../ui/dwell'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { useSettings } from '../ui/settings'
import { useEdit } from '../ui/edit-mode'
import { PickerModal, PickerTile } from '../ui/controls'
import { stripMarkdown } from '../core/markdown'
import { hasChoices, type Phrase } from '../core/phrases'
import { PHRASE_SORTS, sortName } from '../core/sort'
import { type PhraseSort } from '../core/store'
import { needsMore, windowSize } from '../core/virtual'
import { CustomOrderIcon, PageIcon, ReorderIcon, SortAlphaIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { PhraseText } from './phrase-text'

const PhraseCell = memo(function PhraseCell({
  phrase,
  spoken: justSaid,
  reorder,
  onSelect,
}: {
  phrase: Phrase
  /**
   * The last phrase chosen off the board, which stays marked until anything
   * else fires — see `spokenId` below. A boolean rather than the id, so the
   * memo holds for every cell but the two that actually change.
   */
  spoken?: boolean
  /**
   * Present only while the grid is being arranged. Undefined the rest of the
   * time, which is what keeps this memo holding over a couple of thousand cells
   * — `propsFor` builds a fresh object per cell per render.
   */
  reorder?: ReorderProps
  onSelect: (p: Phrase) => void
}) {
  const { settings } = useSettings()
  const { editMode, openEdit } = useEdit()

  const handleActivate = useCallback(() => {
    // Arranging takes precedence: while it is on, a cell is a thing to move
    // rather than a thing to open — or, outside edit mode, to say.
    if (reorder) {
      reorder.onLiftOrDrop()
      return
    }
    if (editMode) {
      openEdit(phrase)
      return
    }
    onSelect(phrase)
  }, [phrase, onSelect, editMode, openEdit, reorder])

  const { active, props } = useDwellControl(settings.phraseDwellMs, handleActivate, {
    // A dwell landing mid-drag would lift a second cell out from under the one
    // already in the pointer's hand.
    disabled: reorder?.dragging,
  })
  const fillable = hasChoices(phrase.segments)
  // What the cell says, not how it is marked up: a screen reader announcing
  // "asterisk asterisk help" is the same failure as the app speaking it.
  const spoken = stripMarkdown(phrase.text)

  return (
    <div
      className={cx(
        'phrase-cell',
        active && 'dwelling',
        justSaid && 'selected',
        editMode && !reorder && 'edit-mode',
        reorder && 'reorderable',
        reorder?.held && 'is-held',
        // Somewhere the held phrase could go — every other cell, while one is
        // in the air.
        reorder?.heldLabel && 'is-drop-zone',
        reorder?.dropTarget && 'is-drop-target',
      )}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      // Says out loud what the tint says by eye. A mark that lasts has to reach
      // somebody reading the board rather than looking at it.
      aria-current={justSaid || undefined}
      aria-label={
        reorder
          ? reorderLabel(reorder, spoken, 'phrase')
          : editMode
            ? `Edit phrase: ${spoken}`
            : fillable
              ? `${spoken} — choose wording`
              : spoken
      }
      draggable={reorder ? true : undefined}
      onDragStart={reorder?.onDragStart}
      onDragOver={
        reorder &&
        (e => {
          // Without this the browser refuses the drop outright.
          e.preventDefault()
          reorder.onDragOver()
        })
      }
      onDragEnd={reorder?.onDragEnd}
      onDrop={
        reorder &&
        (e => {
          e.preventDefault()
          reorder.onDrop()
        })
      }
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

/**
 * How far a page moves: the visible height, less one nudge's worth.
 *
 * Not the whole height. Rows here are not a uniform height — a phrase long
 * enough to wrap three times makes its whole row taller, and about one row in
 * five does — so a jump of exactly one screen can leave a row split across the
 * fold, half at the bottom of one page and half at the top of the next. Keeping
 * a nudge's worth on screen means every row is whole somewhere, and gives the
 * eye something it just read to land on.
 *
 * The floor matters where the grid is shorter than the overlap: a page of
 * nothing is a control that does nothing.
 */
const pageBy = (extent: number) => Math.max(extent - SCROLL_STEP, SCROLL_STEP)

function ScrollBtn({
  onAction,
  repeat,
  disabled,
  pressed,
  label,
  className,
  children,
}: {
  onAction: () => void
  repeat?: boolean
  /** Goes quiet rather than away — see the rail's two tools for the ones that do. */
  disabled?: boolean
  /** For the one control here that is a mode rather than an action. */
  pressed?: boolean
  label: string
  className?: string
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onAction, {
    disabled,
    repeatMs: repeat ? settings.repeatDelayMs : undefined,
  })
  return (
    <div
      className={cx('scroll-btn', className, active && 'dwelling', pressed && 'is-on')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    >
      <div className="scroll-btn-fill" key={active ? 'a' : 'i'} />
      {children}
    </div>
  )
}

/**
 * A clock and a stack of bars, for the two arrangements that are about use. The
 * other two reuse the glyphs the category bar already sorts by, so a user learns
 * one mark for "A to Z" and one for "the order it is in" rather than two.
 *
 * These two live here because nothing else draws them — the rule icons follow in
 * this tree.
 */
const RecentIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 16 14" />
  </svg>
)

const FrequentIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="12" y1="20" x2="12" y2="9" />
    <line x1="18" y1="20" x2="18" y2="4" />
  </svg>
)

/** Which glyph says which arrangement is on. */
const SORT_ICONS: Record<PhraseSort, React.ReactNode> = {
  custom: <CustomOrderIcon />,
  alpha: <SortAlphaIcon />,
  recent: <RecentIcon />,
  frequent: <FrequentIcon />,
}

/**
 * The one control in this rail that does not scroll: which order the phrases are
 * in. It sits **above the jump to the top**, outside the scroll group, because a
 * user learns this rail by position and the five below it are one thing.
 *
 * A full-screen grid rather than a list that drops down, for the reason every
 * choice in this app is one — and a cycling button would be worse still here,
 * since four states behind one glyph is three dwells and a guess to reach the
 * one you want. **Choosing closes it**: there is nothing to preview behind the
 * scrim, so a second dwell on Done would be a target for nothing.
 *
 * It **goes quiet rather than away** under the Sent tab. A control that comes
 * and goes moves the ones below it, and this rail is aimed at rather than read.
 */
function SortControl({
  sort,
  disabled,
  onChoose,
}: {
  sort: PhraseSort
  disabled?: boolean
  onChoose: (sort: PhraseSort) => void
}) {
  const [open, setOpen] = useState(false)

  // Closing puts the board back under a pointer that has not moved, and under a
  // new arrangement the cell arriving there is not the one that was there when
  // the picker opened. Same second the menu takes on its way out, for the same
  // reason: a phrase must not be spoken by the screen moving.
  const close = useCallback(() => {
    setOpen(false)
    holdDwells()
  }, [])

  return (
    <>
      <ScrollBtn
        className="rail-tool sort-btn"
        disabled={disabled}
        onAction={() => setOpen(true)}
        // The glyph says which order is on, so the name does too — a control
        // that has gone quiet, or that is read aloud, explains nothing by itself.
        label={
          disabled
            ? `Phrase order: ${sortName(sort)}. Sent messages are always newest first`
            : `Phrase order: ${sortName(sort)}. Choose another`
        }
      >
        {SORT_ICONS[sort]}
      </ScrollBtn>

      {open && (
        <PickerModal
          title="Order the phrases"
          hint="How every category is arranged"
          onDone={close}
          onCancel={close}
        >
          {PHRASE_SORTS.map(option => (
            <PickerTile
              key={option.id}
              name={option.name}
              detail={option.detail}
              selected={option.id === sort}
              onSelect={() => {
                onChoose(option.id)
                close()
              }}
            />
          ))}
        </PickerModal>
      )}
    </>
  )
}

/**
 * The rail: which order the phrases are in, and then five ways of moving through
 * them. The two mode toggles used to head it; they are in the topbar now, either
 * side of Rest, which is the third of the three and was already there.
 */
function GridScrollBar({
  gridRef,
  sort,
  sortDisabled,
  onChooseSort,
  reordering,
  reorderDisabled,
  onToggleReorder,
  onBeforeJumpToBottom,
}: {
  gridRef: React.RefObject<HTMLElement | null>
  sort: PhraseSort
  sortDisabled?: boolean
  onChooseSort: (sort: PhraseSort) => void
  reordering?: boolean
  /** True under All and Sent, neither of which is a category to arrange. */
  reorderDisabled?: boolean
  /** Edit mode only; absent otherwise, and the control with it. */
  onToggleReorder?: () => void
  /** Renders the rest of the list, so the jump has somewhere to land. */
  onBeforeJumpToBottom: () => void
}) {
  const scrollTo = useCallback(
    (pos: number) => gridRef.current?.scrollTo({ top: pos, behavior: 'smooth' }),
    [gridRef],
  )
  const scrollBy = useCallback(
    (dy: number) => gridRef.current?.scrollBy({ top: dy, behavior: 'smooth' }),
    [gridRef],
  )
  // Measured at the moment it is asked for rather than held in state: the grid
  // resizes with the keyboard, with rotation, and with the filter bar coming and
  // going, and a page is only ever wanted now.
  const scrollPage = useCallback(
    (direction: 1 | -1) => scrollBy(direction * pageBy(gridRef.current?.clientHeight ?? 0)),
    [scrollBy, gridRef],
  )

  return (
    <div className="grid-scrollbar">
      {/* The controls that are about the grid rather than about moving through
          it, grouped and ruled off. The five below are one thing, learnt by
          position, and nothing may be inserted among them. */}
      <div className="rail-tools">
        <SortControl sort={sort} disabled={sortDisabled} onChoose={onChooseSort} />
        {onToggleReorder && (
          <ScrollBtn
            className="rail-tool reorder-btn"
            disabled={reorderDisabled}
            pressed={reordering}
            onAction={onToggleReorder}
            label={
              reorderDisabled
                ? 'Arrange the phrases by hand. Open a category first — All cannot be arranged'
                : reordering
                  ? 'Done arranging the phrases'
                  : 'Arrange the phrases by hand'
            }
          >
            <ReorderIcon />
          </ScrollBtn>
        )}
      </div>
      <ScrollBtn onAction={() => scrollTo(0)} label="Scroll to top">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="5" y1="6" x2="19" y2="6" />
          <polyline points="8 14 12 10 16 14" />
        </svg>
      </ScrollBtn>
      {/* A screenful at a time, repeating while held at whatever pace the
          auto-repeat setting says — see `PageIcon` for why the double chevron,
          and `pageBy` for why not a whole screen.

          These two are the pair that goes on a short screen: six controls in a
          column need vertical room the grid has more use for, and a nudge held
          down crosses the same distance. See `.scroll-btn-page` in `index.css`. */}
      <ScrollBtn onAction={() => scrollPage(-1)} repeat className="scroll-btn-page" label="Previous page">
        <PageIcon direction="up" />
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollBy(-SCROLL_STEP)} repeat label="Scroll up">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollBy(SCROLL_STEP)} repeat label="Scroll down">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </ScrollBtn>
      <ScrollBtn onAction={() => scrollPage(1)} repeat className="scroll-btn-page" label="Next page">
        <PageIcon direction="down" />
      </ScrollBtn>
      <ScrollBtn
        onAction={() => {
          onBeforeJumpToBottom()
          scrollTo(999999)
        }}
        label="Scroll to bottom"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="5" y1="18" x2="19" y2="18" />
          <polyline points="8 10 12 14 16 10" />
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
export function PhraseGrid({
  phrases,
  listKey,
  emptyMessage,
  sort,
  sortDisabled,
  onChooseSort,
  reordering,
  reorderDisabled,
  onToggleReorder,
  onReorder,
  onLift,
  onSelect,
}: {
  phrases: Phrase[]
  /**
   * What makes this a *different list* rather than the same one in a new order —
   * the tab and the word being typed. The window starts again when it changes.
   */
  listKey: string
  /** Shown when there is nothing to show, for filters that can legitimately be empty. */
  emptyMessage?: string
  /** Which of the four orders the list arrived in — the rail says which. */
  sort: PhraseSort
  /** True under Sent, which has an order of its own and keeps it. */
  sortDisabled?: boolean
  onChooseSort: (sort: PhraseSort) => void
  /** All five of these are edit-mode only. */
  reordering?: boolean
  reorderDisabled?: boolean
  onToggleReorder?: () => void
  onReorder?: (from: string, to: string) => void
  /** Announced when a phrase is picked up — the styling alone says nothing aloud. */
  onLift?: (label: string) => void
  onSelect: (phrase: Phrase) => void
}) {
  const gridRef = useRef<HTMLElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  /**
   * The last phrase chosen off the board, kept marked until **anything else
   * fires** — a scroll, a tab, a mode, the menu.
   *
   * It used to be a third of a second of tint on a timer, which under an order
   * that follows use was a flash on a cell that was moving at the same moment.
   * A mark that lasts is what says *that one, and it went there*. It ends on the
   * next dwell rather than on a clock because what it claims — this is the last
   * thing you did — stops being true the moment anything else happens, and
   * because a timer would take it away while somebody was still reading the
   * board for it.
   *
   * Cleared *before* each activation, so the cell that is firing right now can
   * set its own mark afterwards rather than have it cleared out from under it.
   */
  const [spokenId, setSpokenId] = useState<string | null>(null)
  useEffect(() => onDwellActivation(() => setSpokenId(null)), [])

  const selectPhrase = useCallback(
    (phrase: Phrase) => {
      setSpokenId(phrase.id)
      onSelect(phrase)
    },
    [onSelect],
  )

  // A phrase is keyed by its id, so what it is called has to be looked up — and
  // through a map rather than a scan, since every cell asks what is in the air.
  // Built only while arranging: a couple of thousand entries is cheap, and the
  // board is rebuilt on every phrase spoken under an order that follows use.
  const labels = useMemo(
    () => (reordering ? new Map(phrases.map(p => [p.id, stripMarkdown(p.text)])) : null),
    [reordering, phrases],
  )
  const { propsFor, release } = useReorder({
    onReorder,
    onLift,
    labelOf: id => labels?.get(id) ?? id,
  })

  // Switching the mode off puts down whatever was in the air. Without this the
  // phrase stays held across the round trip, and the next dwell drops the
  // forgotten one instead of lifting the cell under the pointer.
  const toggleReorder = useCallback(() => {
    release()
    onToggleReorder?.()
  }, [release, onToggleReorder])
  /** Cells one measured windowful holds. Null until something has been laid out. */
  const [step, setStep] = useState<number | null>(null)
  /** How many to render. Null renders the lot, which is the unmeasured answer. */
  const [shown, setShown] = useState<number | null>(null)

  // A different list starts again from one windowful. Adjusting during render
  // rather than in an effect avoids a pass showing the old window over the new
  // list — and `step` is state, so this reads nothing it should not.
  //
  // **Keyed on what makes it a different list, not on the array's identity.**
  // The board is rearranged live by the orders that follow use, so the array is
  // a new one on every phrase spoken — and collapsing the window back to a
  // screenful each time would shrink the grid under somebody and take the view
  // with it, which is the whole of what a rearrangement must not do.
  const [forKey, setForKey] = useState(listKey)
  if (forKey !== listKey) {
    setForKey(listKey)
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
            <PhraseCell
              key={phrase.id}
              phrase={phrase}
              spoken={phrase.id === spokenId}
              reorder={reordering ? propsFor(phrase.id) : undefined}
              onSelect={selectPhrase}
            />
          ))}
        </div>
        {phrases.length === 0 && emptyMessage && <p className="grid-empty">{emptyMessage}</p>}
      </main>
      <GridScrollBar
        gridRef={gridRef}
        sort={sort}
        sortDisabled={sortDisabled}
        onChooseSort={onChooseSort}
        reordering={reordering}
        reorderDisabled={reorderDisabled}
        onToggleReorder={onToggleReorder && toggleReorder}
        onBeforeJumpToBottom={showEverything}
      />
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

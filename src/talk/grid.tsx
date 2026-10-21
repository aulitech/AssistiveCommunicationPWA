// The phrase grid and the rail of controls beside it.
//
// The grid renders every phrase in the table — a couple of thousand cells — so
// the cell is memoised and takes callbacks that do not change between renders.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onDwellActivation, useDwellControl } from '../ui/dwell'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { useSettings } from '../ui/settings'
import { useEdit } from '../ui/edit-mode'
import { stripMarkdown } from '../core/markdown'
import { hasChoices, type Phrase } from '../core/phrases'
import { needsMore, windowSize } from '../core/virtual'
import { pageTarget } from '../core/paging'
import { GripIcon, ScrollDownIcon, ScrollUpIcon, TrashIcon } from '../ui/icons'
import { useScrollEdges } from '../ui/scroll-edges'
import { cx, dwellVar } from '../ui/style'
import { ItemTool } from './item-tool'
import { PhraseText } from './phrase-text'

const PhraseCell = memo(function PhraseCell({
  phrase,
  spoken: justSaid,
  reorder,
  held,
  tools,
  inert,
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
   * Present only on every other cell while one is in the air — somewhere to put
   * it. Undefined the rest of the time, which is what keeps this memo holding
   * over a couple of thousand cells — `propsFor` builds a fresh object per cell
   * per render.
   */
  reorder?: ReorderProps
  /** This is the phrase in the air — lifted by its own drag pad. */
  held?: boolean
  /** **The phrase open in the message box** carries its tools — see `PhraseGrid`. */
  tools?: React.ReactNode
  /**
   * **Not to be chosen**: in edit mode, while the box holds a phrase opened and
   * not yet changed — see `choosing` on the screen. Still somewhere to drop a
   * phrase in the air.
   */
  inert?: boolean
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
    // The phrase open in the box answers to its tools, not to itself — as the
    // tab showing does.
    disabled: reorder?.dragging || Boolean(tools) || (inert && !reorder),
  })
  const fillable = hasChoices(phrase.segments)
  // What the cell says, not how it is marked up: a screen reader announcing
  // "asterisk asterisk help" is the same failure as the app speaking it.
  const spoken = stripMarkdown(phrase.text)

  return (
    <div
      className={cx(
        'phrase-cell',
        // Two lines rather than one, so the cell stacks them instead of setting
        // them side by side — the cell is a centring flex row for every other
        // phrase in the app.
        phrase.detail && 'has-detail',
        active && 'dwelling',
        justSaid && 'selected',
        editMode && !reorder && 'edit-mode',
        tools ? 'has-tools' : null,
        inert && !reorder && !tools && 'is-inert',
        held && 'is-held',
        // Somewhere the held phrase could go — every other cell, while one is
        // in the air.
        reorder?.heldLabel && 'is-drop-zone',
        reorder?.dropTarget && 'is-drop-target',
      )}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      // How the grid finds the cell it has to scroll to. The id rather than a
      // position, the list being rearranged under this by four orders.
      data-phrase={phrase.id}
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
              : phrase.detail
                ? `${spoken} — ${phrase.detail}`
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
      // Disabled would say so of the tools inside it too, which are live.
      aria-disabled={tools ? undefined : props['aria-disabled']}
    >
      <span className="phrase-cell-text">
        <PhraseText segments={phrase.segments} />
      </span>
      {/* The Translations tab, and nowhere else: what came out of the speaker,
          with the board's own wording under it. `aria-hidden`, because the
          label above already reads both halves — a screen reader finding it
          twice would say the phrase, then say it again. */}
      {phrase.detail && (
        <span className="phrase-cell-detail" aria-hidden="true">
          {phrase.detail}
        </span>
      )}
      {tools && <span className="cell-tools">{tools}</span>}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
})

// ── SlotPicker ────────────────────────────────────────────────────────────────
// Phrases from the table are fill-in-the-blank ("Please turn {control} the
// {['music','tv']}"). Selecting one walks the user through its slots by dwell
// rather than dropping raw placeholder text into the message.

/** The least time between two pages — see `page` in `GridArrows`. */
const PAGE_SETTLE_MS = 500
/** A scroll this recent means the grid is still moving from the last page. */
const STILL_MOVING_MS = 150
/** Frames without the grid moving that say a scroll has come to rest. */
const SCROLL_AT_REST_FRAMES = 5

/**
 * **The two arrows over the grid**, the whole of its scrolling: up at the top
 * of the rightmost column and down at its foot, floating translucent over the
 * cells, each half a cell high and a third of one wide — measured off a cell,
 * so they follow the columns a screen gives and the text size. A page per
 * dwell, smoothly, and on while the pointer rests there, at the Auto-repeat
 * setting. Each is there only while there is somewhere to go: one that has
 * nowhere hides and lets the pointer through to the cell under it.
 *
 * They replace a rail of six — a nudge, a page and an end each way — and the
 * column it took from the grid. The ends went with it: a long board is reached
 * by paging, and the grid grows as it is paged, so there is nothing a page
 * cannot reach.
 */
function GridArrows({
  gridRef,
  innerRef,
}: {
  gridRef: React.RefObject<HTMLElement | null>
  innerRef: React.RefObject<HTMLElement | null>
}) {
  const edges = useScrollEdges(gridRef)
  const { update } = edges
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // A cell's width and height, a third and a half of which each arrow is — on
  // every resize, since a phone turned on its side has another number of
  // columns and somebody may have turned the text up.
  useEffect(() => {
    const wrapper = gridRef.current
    if (!wrapper) return
    const measureCell = () => {
      const cell = innerRef.current?.querySelector<HTMLElement>('.phrase-place')
      if (!cell) return setSize(null)
      const rect = cell.getBoundingClientRect()
      const least = parseFloat(getComputedStyle(cell.firstElementChild ?? cell).minHeight)
      const height = Number.isFinite(least) && least > 0 ? least : rect.height
      if (rect.width <= 0 || height <= 0) return setSize(null)
      setSize(current =>
        current && current.width === rect.width && current.height === height
          ? current
          : { width: rect.width, height },
      )
      update()
    }
    measureCell()
    const ro = new ResizeObserver(measureCell)
    ro.observe(wrapper)
    if (innerRef.current) ro.observe(innerRef.current)
    return () => ro.disconnect()
  }, [gridRef, innerRef, update])

  /**
   * **Debounced**: a page is refused while the grid is still moving from the
   * last one, and within `PAGE_SETTLE_MS` of it whatever — so a rest that
   * fires and a gaze rig's click straight after it, or a repeat set quicker
   * than a smooth scroll takes, move the grid once rather than twice, and each
   * page is measured from where the grid has come to rest.
   */
  const lastPage = useRef(0)
  const lastScroll = useRef(0)
  useEffect(() => {
    const wrapper = gridRef.current
    if (!wrapper) return
    const moved = () => {
      lastScroll.current = Date.now()
    }
    wrapper.addEventListener('scroll', moved, { passive: true })
    return () => wrapper.removeEventListener('scroll', moved)
  }, [gridRef])

  const page = useCallback(
    (direction: 1 | -1) => {
      const wrapper = gridRef.current
      const grid = innerRef.current
      if (!wrapper || !grid) return
      const now = Date.now()
      if (now - lastPage.current < PAGE_SETTLE_MS || now - lastScroll.current < STILL_MOVING_MS) return
      lastPage.current = now
      const from = wrapper.scrollTop
      const padding = parseFloat(getComputedStyle(wrapper).paddingTop) || 0
      // Half the gap between rows above the one landed on, so nothing of the
      // row before it shows over the top edge; the first row goes to the very top.
      const gap = parseFloat(getComputedStyle(grid).rowGap) || 0
      const base = wrapper.getBoundingClientRect().top - wrapper.scrollTop
      // Where each row starts, as a scroll position that puts it at the top.
      const tops = new Set<number>()
      for (const place of grid.querySelectorAll<HTMLElement>('.phrase-place')) {
        const at = place.getBoundingClientRect().top - base
        tops.add(at <= padding + 1 ? 0 : Math.round(at - gap / 2))
      }
      const most = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight)
      const top = Math.min(most, pageTarget(from, wrapper.clientHeight, [...tops], direction))
      wrapper.scrollTo({ top, behavior: 'smooth' })
    },
    [gridRef, innerRef],
  )

  const style = size
    ? ({ '--arrow-w': `${size.width / 3}px`, '--arrow-h': `${size.height / 2}px` } as React.CSSProperties)
    : undefined
  return (
    <>
      <GridArrow direction="up" style={style} hidden={!size || !edges.canUp} onPage={() => page(-1)} />
      <GridArrow direction="down" style={style} hidden={!size || !edges.canDown} onPage={() => page(1)} />
    </>
  )
}

function GridArrow({
  direction,
  style,
  hidden,
  onPage,
}: {
  direction: 'up' | 'down'
  style?: React.CSSProperties
  hidden: boolean
  onPage: () => void
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onPage, {
    disabled: hidden,
    repeatMs: settings.repeatDelayMs,
  })
  return (
    <div
      className={cx('grid-arrow', `is-${direction}`, active && 'dwelling', hidden && 'is-hidden')}
      style={{ ...style, ...dwellVar(settings.actionDwellMs) }}
      role="button"
      aria-label={direction === 'up' ? 'Previous page' : 'Next page'}
      aria-hidden={hidden || undefined}
      {...props}
    >
      <span className="grid-arrow-fill" key={active ? 'a' : 'i'} />
      {direction === 'up' ? <ScrollUpIcon /> : <ScrollDownIcon />}
    </div>
  )
}

/**
 * The grid and the two arrows over it. They are one component because the
 * arrows scroll the grid, and the reference between them is nobody else's business.
 *
 * Only the first `shown` cells are rendered — see `core/virtual.ts` for why the
 * window grows from the top rather than sliding.
 */
export function PhraseGrid({
  phrases,
  listKey,
  emptyMessage,
  busy,
  canArrange,
  narrowed,
  open,
  onDeleteOpen,
  choosing = true,
  onReorder,
  onLift,
  onSelect,
  pointing,
  peek,
}: {
  phrases: Phrase[]
  /**
   * What makes this a *different list* rather than the same one in a new order —
   * the tab and the word being typed. The window starts again when it changes.
   */
  listKey: string
  /** Shown when there is nothing to show, for filters that can legitimately be empty. */
  emptyMessage?: string
  /**
   * Whether what would fill the grid is still on its way — the answers to a
   * question, which are the one thing here that arrives from a network. It
   * spins beside the line rather than in the corner, because this is where the
   * cells are going to land and a gaze already on the board should not have to
   * go looking for the news that they are coming.
   */
  busy?: boolean
  /** False under the answers and Translations: nothing to arrange. */
  canArrange: boolean
  /**
   * The grid is narrowed to a word. Arranging then would arrange only what
   * matched, so the drag pad is not offered.
   */
  narrowed?: boolean
  /**
   * **The phrase open in the message box**, in edit mode — the active phrase,
   * as the tab showing is the active tab. Its cell carries a bin against its
   * left edge, which asks first (`onDeleteOpen`), and a drag pad against its
   * right where the tab is one to arrange. `changed` once its words are not
   * what they were. Null where nothing is open, or it is not in this grid.
   * `pinned` where the tab does not hold it and it is shown first anyway, and
   * `bin` what the bin does here — forgets, takes out, or deletes.
   */
  open?: { id: string; changed: boolean; pinned?: boolean; bin?: string } | null
  onDeleteOpen?: () => void
  /**
   * **Whether a phrase may be chosen off the board** — false in edit mode while
   * the box holds a phrase opened and not yet changed, so a rest meant for
   * reading cannot put a second phrase into the first.
   */
  choosing?: boolean
  onReorder?: (from: string, to: string) => void
  /** Announced when a phrase is picked up — the styling alone says nothing aloud. */
  onLift?: (label: string) => void
  onSelect: (phrase: Phrase) => void
  /**
   * A phrase the board is pointing at: marked as the last thing done, and
   * brought into view. One it has just made, or one it has just gone looking
   * for — see `pointing` in `talk.tsx`.
   *
   * What a save leaves behind otherwise is one more cell among a couple of
   * thousand and a line of text that fades. The two halves answer the two
   * halves of that — the mark says *which one*, and the scroll is what makes
   * the mark worth having, a cell being as likely as not below the fold.
   *
   * **The object is the event, not the id.** Pointed at the same phrase twice
   * — composed, put away, composed again — is two occasions, and a string
   * would be the same value both times and do nothing the second.
   */
  pointing?: { id: string } | null
  /**
   * An emergency phrase's words, shown whole and large in the middle of the
   * table while its button is rested on and the bar is cutting words off — see
   * `onPeek` in `EmergencyBar`. Not a control, and nothing a pointer does here
   * can arm anything.
   */
  peek?: string | null
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
  // Built only in edit mode: a couple of thousand entries is cheap, and the
  // board is rebuilt on every phrase spoken under an order that follows use.
  const { editMode } = useEdit()
  const labels = useMemo(
    () => (editMode ? new Map(phrases.map(p => [p.id, stripMarkdown(p.text)])) : null),
    [editMode, phrases],
  )
  const { propsFor, release, held, dragging } = useReorder({
    onReorder,
    onLift,
    labelOf: id => labels?.get(id) ?? id,
  })
  // **The drag pad only where arranging means something**: a tab of its own
  // order, not narrowed to a word.
  const canMove = editMode && canArrange && !narrowed && onReorder !== undefined
  // Whatever was in the air is put back when the phrase open in the box is
  // another, or none, or reworded, or edit mode ends — the tool that lifted it
  // has gone.
  const openId = open?.id ?? null
  const changed = open?.changed ?? false
  const pinned = open?.pinned ?? false
  useEffect(() => {
    release()
  }, [openId, changed, editMode, release])

  // In the air by a dwell or by a mouse: either way every other one is
  // somewhere to put it.
  const inHand = held ?? dragging
  /**
   * **The open phrase's two tools**: the bin against its left edge, and the
   * drag pad against its right — the pad only where there is somewhere to
   * move it, so not on a tab kept in an order of its own or narrowed to a
   * word, Translations among them, nor on a phrase pinned to a tab that does
   * not hold it.
   */
  const toolsFor = (id: string) => (
    <>
      <ItemTool
        className="delete-tool"
        label={open?.bin ?? 'Delete this phrase'}
        onActivate={() => onDeleteOpen?.()}
      >
        <TrashIcon />
      </ItemTool>
      {canMove && !pinned && (
        <ItemTool
          className="reorder-tool"
          label={held === id ? 'Put it back where it was' : 'Move this phrase'}
          pressed={held === id}
          onActivate={() => propsFor(id).onLiftOrDrop()}
          drag={propsFor(id)}
        >
          <GripIcon />
        </ItemTool>
      )}
    </>
  )
  /** Cells one measured windowful holds. Null until something has been laid out. */
  const [step, setStep] = useState<number | null>(null)
  /** How many to render. Null renders the lot, which is the unmeasured answer. */
  const [shown, setShown] = useState<number | null>(FIRST_WINDOW)

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

  /**
   * A phrase the board points at takes the mark the last one chosen takes:
   * one mark meaning *that one, and it went there*, rather than a second one to
   * learn. It goes the same way too — on the next dwell, whatever that is.
   *
   * Adjusted during render rather than in an effect, the rule for state that
   * follows a prop: an effect would paint one frame of the board without it.
   * Starting at null rather than at `pointing` so that a grid mounting with
   * one already named still marks it.
   */
  const [pointedFor, setPointedFor] = useState<{ id: string } | null>(null)
  if (pointedFor !== pointing) {
    setPointedFor(pointing ?? null)
    if (pointing) setSpokenId(pointing.id)
  }

  /**
   * Where it landed, so the window can be grown to reach it. **After the reset
   * above, which is the pass this matters in**: arriving at the tab starts the
   * window again at a screenful, and a category runs to a hundred and eighty
   * phrases — so the new one is often past the end of what is rendered, and a
   * cell that does not exist is nothing to scroll to. The grid grows on its own
   * only for somebody scrolling towards the bottom, which is the very thing
   * this is here to save them.
   */
  const pointedAt = useMemo(
    () => (pointing ? phrases.findIndex(p => p.id === pointing.id) : -1),
    [pointing, phrases],
  )
  if (pointedAt >= 0 && shown !== null && shown <= pointedAt) setShown(pointedAt + 1)

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
    if (measured !== null && measured !== step) setStep(measured)
    // Nothing to measure from is the case this has always had an answer for:
    // render the lot, a phrase out of reach being worse than a slow grid.
    const next =
      measured === null
        ? null
        : shown === null
          ? measured
          : needsMore(wrapper, shown, phrases.length)
            ? shown + measured
            : shown
    if (next !== shown) setShown(next)
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

  /**
   * And brought into view.
   *
   * **The cell is always there by the time this runs**, which is what the two
   * adjustments above are for: both happen during the render that named the
   * phrase, so React has already re-rendered with a window wide enough to hold
   * it before anything is committed. So this asks once, on the phrase, rather
   * than watching the window for a cell to appear.
   *
   * Centred rather than merely on screen — a cell against the top edge sits
   * under the message box, and one against the bottom under the emergency bar.
   *
   * **And aimed again once the scroll comes to rest, until it is on screen.**
   * A cell is `content-visibility: auto`, a placeholder height until it comes
   * near the screen, so every cell the scroll passes takes its real height as
   * it goes and the phrase moves after it was aimed at: one two hundred cells
   * down landed a screen and a half past where it was. A few tries at most —
   * a cell can be past where the grid can scroll, and somebody may be paging.
   */
  useEffect(() => {
    if (!pointing) return
    const wrapper = gridRef.current
    const cell = () => innerRef.current?.querySelector(`[data-phrase="${pointing.id}"]`)
    const aim = () => cell()?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    aim()
    let frame = 0
    let last = NaN
    let still = 0
    let tries = 0
    const settle = () => {
      const top = wrapper?.scrollTop ?? 0
      still = top === last ? still + 1 : 0
      last = top
      if (still >= SCROLL_AT_REST_FRAMES) {
        const at = cell()?.getBoundingClientRect()
        const view = wrapper?.getBoundingClientRect()
        if (!at || !view || (at.top >= view.top && at.bottom <= view.bottom) || ++tries > 3) return
        aim()
        still = 0
      }
      frame = requestAnimationFrame(settle)
    }
    frame = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(frame)
  }, [pointing])

  useMagnifier(innerRef, gridRef, phrases, held !== null || !choosing)

  return (
    <div className="grid-area">
      <main ref={gridRef} className="grid-wrapper">
        <div ref={innerRef} className="phrase-grid" role="group" aria-label="Phrases">
          {/* Each cell in a place of its own in the grid, which it holds while
              the cell grows out of it — see `useMagnifier`. */}
          {visible.map(phrase => (
            <div key={phrase.id} className="phrase-place">
              <PhraseCell
                phrase={phrase}
                spoken={phrase.id === spokenId}
                reorder={inHand && inHand !== phrase.id ? propsFor(phrase.id) : undefined}
                held={held === phrase.id}
                tools={phrase.id === openId ? toolsFor(phrase.id) : undefined}
                inert={!choosing}
                onSelect={selectPhrase}
              />
            </div>
          ))}
        </div>
        {phrases.length === 0 && emptyMessage && (
          <p className={cx('grid-empty', busy && 'is-busy')} role="status" aria-live="polite">
            {busy && <span className="busy-spinner" aria-hidden="true" />}
            {emptyMessage}
          </p>
        )}
      </main>
      {peek && (
        <div className="emergency-peek" aria-hidden="true">
          <span>{peek}</span>
        </div>
      )}
      <GridArrows gridRef={gridRef} innerRef={innerRef} />
    </div>
  )
}

/**
 * Columns come from the grid's own computed style rather than from a copy of the
 * breakpoints, so the two cannot drift. Both this and the row height read as
 * nothing until something has been laid out, which `windowSize` turns into
 * "render everything".
 */
/**
 * How much to render before anything has been measured — a screenful and more
 * on any screen this app is used on.
 *
 * **Measuring needs something rendered to measure**, so the alternative to a
 * guess is mounting all two thousand-odd cells once on the way to
 * windowing them down, which is the most expensive thing the board does and it
 * did it every time it opened.
 *
 * Nothing rests on the number: the effect above measures on the next tick and
 * grows the window until the grid is scrollable, and where nothing can be
 * measured at all it renders everything, exactly as it did before this existed.
 */
const FIRST_WINDOW = 120

/**
 * **The cell under the pointer, magnified** — as the Dock magnifies what is
 * under it. Grown out of its place over its neighbours rather than in it, so
 * nothing else on the board moves, and its words given twice the width, so a
 * long phrase is read in two lines rather than five.
 *
 * **A frame after the pointer arrives**, never in the same event: every control
 * asks, as the pointer enters it, whether it came to the pointer rather than
 * the pointer to it (`cameToPointer` in `ui/dwell.ts`). A cell grown before it
 * was asked would cover where the pointer had just been, and be refused as
 * one that moved. Kept inside the grid's own edges, where it would run off
 * them. Not for touch, where nothing hovers; nor while a phrase is in the air,
 * where a cell is a thing to put it on; nor while the box holds a phrase as it
 * was opened, where nothing on the board is to be chosen (`choosing`).
 */
function useMagnifier(
  gridRef: React.RefObject<HTMLElement | null>,
  wrapperRef: React.RefObject<HTMLElement | null>,
  phrases: Phrase[],
  off: boolean,
) {
  useEffect(() => {
    const grid = gridRef.current
    const wrapper = wrapperRef.current
    if (!grid || !wrapper || off) return
    let current: HTMLElement | null = null
    let frame = 0
    const shrink = () => {
      cancelAnimationFrame(frame)
      if (!current) return
      current.classList.remove('is-magnified')
      current.style.removeProperty('height')
      current.style.removeProperty('--lens-dx')
      current.style.removeProperty('--lens-dy')
      current = null
    }
    const grow = (place: HTMLElement) => {
      shrink()
      current = place
      // Held at the height it has, or a row whose tallest cell this was would
      // close up under it — to the fraction of a pixel, since `offsetHeight`
      // rounds and a row a pixel taller moves every row under it.
      place.style.height = `${place.getBoundingClientRect().height}px`
      place.classList.add('is-magnified')
      const lens = place.firstElementChild
      if (!(lens instanceof HTMLElement)) return
      // From the place's centre and the lens's own size rather than from where
      // the lens is drawn, which its arrival is still animating.
      const at = place.getBoundingClientRect()
      const edges = wrapper.getBoundingClientRect()
      const inside = (centre: number, size: number, from: number, to: number) => {
        const start = centre - size / 2
        if (start < from + 4) return from + 4 - start
        if (start + size > to - 4) return to - 4 - (start + size)
        return 0
      }
      const dx = inside((at.left + at.right) / 2, lens.offsetWidth, edges.left, edges.right)
      const dy = inside((at.top + at.bottom) / 2, lens.offsetHeight, edges.top, edges.bottom)
      place.style.setProperty('--lens-dx', `${dx}px`)
      place.style.setProperty('--lens-dy', `${dy}px`)
    }
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const place = (e.target as Element).closest<HTMLElement>('.phrase-place')
      if (!place || place === current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => grow(place))
    }
    grid.addEventListener('pointerover', over)
    grid.addEventListener('pointerleave', shrink)
    // **Anything that moves the board puts it back**: a scroll, or the board
    // pushed down by a message box growing round what was just said. The cell
    // goes with its place, and would stand grown over somewhere the pointer no
    // longer is; the pointer's next movement decides again.
    wrapper.addEventListener('scroll', shrink, { passive: true })
    const resized = new ResizeObserver(shrink)
    resized.observe(wrapper)
    return () => {
      grid.removeEventListener('pointerover', over)
      grid.removeEventListener('pointerleave', shrink)
      wrapper.removeEventListener('scroll', shrink)
      resized.disconnect()
      shrink()
    }
    // A new list puts every cell somewhere else as well.
  }, [gridRef, wrapperRef, phrases, off])
}

function measure(wrapper: HTMLElement | null, grid: HTMLElement | null): number | null {
  if (!wrapper || !grid) return null
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
  const cell = grid.firstElementChild
  const rowHeight = cell instanceof HTMLElement ? cell.offsetHeight : 0
  return windowSize(wrapper, { columns, rowHeight })
}

// The controls every screen is built from.
//
// All of them are dwell-first: `useDwellControl` handles hover-and-hold, tap and
// Enter/Space together, and each one renders the fill bar that shows a dwell in
// progress. Anything here is used by more than one screen — a control with a
// single caller lives with its caller.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDwellControl } from './dwell'
import { useSettings } from './settings'
import { ResetIcon } from './icons'
import { prosePieces, type ProseSection } from '../core/prose'
import { PROSE_ICONS } from './prose-icons'
import { cx, dwellVar } from './style'
import { useSettled } from './settle'
import { useScrollEdges, type ScrollEdges } from './scroll-edges'
import { useCaretDwell } from './caret'

export function DwellCursor() {
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

export function DwellButton({
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

export function NavItem({
  icon,
  label,
  sublabel,
  disabled,
  onSelect,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  /**
   * Deaf to a dwell for the moment — the guard the menu holds up after one of
   * these closes. Nothing about it changes on the way past: a row of items
   * greying out for a second and coming back reads as a fault rather than as a
   * pause. The fill simply does not start, which is the honest cue.
   */
  disabled?: boolean
  onSelect: () => void
}) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)
  const handleActivate = useCallback(() => {
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 320)
  }, [onSelect])
  const { active, props } = useDwellControl(settings.actionDwellMs, handleActivate, { disabled })

  return (
    <div
      className={cx('nav-item', active && 'dwelling', flash && 'flashed')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      {...props}
    >
      <span className="nav-item-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="nav-item-text">
        <span className="nav-item-label">{label}</span>
        {sublabel && <span className="nav-item-sub">{sublabel}</span>}
      </div>
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

/**
 * A setting, and optionally a line about it.
 *
 * `note` is for the rows that have to say what leaves the device — the spoken
 * language does, since choosing one is what starts sending phrases to be
 * translated. It takes a line of its own below the control, which is why the
 * row it is on aligns to the top rather than to the middle of two lines.
 */
export function SettingRow({
  label,
  note,
  children,
}: {
  label: string
  note?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={cx('setting-row', note ? 'has-note' : '')}>
      <span className="setting-label">{label}</span>
      <div className="setting-control">
        {children}
        {note && <p className="setting-note">{note}</p>}
      </div>
    </div>
  )
}

function StepBtn({
  onAction,
  children,
  label,
  repeat = true,
  disabled,
}: {
  onAction: () => void
  children: React.ReactNode
  label: string
  /** Off for the revert, which has one place to go and arrives on the first fire. */
  repeat?: boolean
  disabled?: boolean
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onAction, {
    repeatMs: repeat ? settings.repeatDelayMs : undefined,
    disabled,
  })
  return (
    <div
      className={cx('step-btn', active && 'dwelling', disabled && 'is-disabled')}
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

export function SettingSpinner({
  value,
  min,
  max,
  step,
  format,
  onValue,
  defaultValue,
  name,
}: {
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onValue: (v: number) => void
  /**
   * What this setting shipped as, **in the units the spinner shows** — Volume
   * counts in percent and Speed in tenths, so the caller scales it the same way
   * it scales `value`.
   */
  defaultValue: number
  /** Names the setting in the revert's label, since the icon says nothing aloud. */
  name: string
}) {
  const clamp = useCallback(
    (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step)),
    [min, max, step],
  )
  const dec = useCallback(() => onValue(clamp(value - step)), [value, step, onValue, clamp])
  const inc = useCallback(() => onValue(clamp(value + step)), [value, step, onValue, clamp])
  const revert = useCallback(() => onValue(clamp(defaultValue)), [defaultValue, onValue, clamp])

  /**
   * The longest thing this spinner can ever write beside the figures, which is
   * what its label is sized to.
   *
   * **Sized to what it could say, not to what it is saying.** The label was 32px
   * whatever it held, which cut `1000ms` to `1000r` and ran `100%` into the +
   * beside it. Fitting it to its content as it changed would fix that and move the
   * + and the reset every time the value crossed a digit — and those are aimed at
   * by position. So every value in range is written once and the widest kept.
   * The ranges are a few dozen steps at most.
   */
  const widest = useMemo(() => {
    let longest = ''
    for (let v = min; v <= max; v += step) {
      const said = format(clamp(v))
      if (said.length > longest.length) longest = said
    }
    return longest
  }, [min, max, step, format, clamp])

  return (
    <div className="setting-spinner">
      <StepBtn onAction={dec} label="Decrease">
        −
      </StepBtn>
      {/* The value in figures, for anybody who would rather type one than step to
          it — and so it takes the caret by dwell, or Peri's own keyboard could
          not reach it. **Text rather than `number`**, because a number field
          refuses `setSelectionRange`, which is how the caret is placed: the
          dwell would have thrown the moment it fired. `inputMode` keeps the
          keypad a phone would have offered. */}
      <DwellInput
        className="setting-number"
        type="text"
        inputMode="numeric"
        aria-label={`${name} value`}
        value={value}
        onChange={e => {
          const n = Number(e.target.value)
          if (!isNaN(n)) onValue(clamp(n))
        }}
      />
      {/* The widest value rides along as an attribute, drawn invisibly in the same
          grid cell as the real one so the label is always that wide — and out of
          the text, so a screen reader and a test both read the value alone. */}
      <span className="setting-formatted" data-widest={widest}>
        <span>{format(value)}</span>
      </span>
      <StepBtn onAction={inc} label="Increase">
        +
      </StepBtn>
      {/* Always here, going quiet at the default rather than away. Somebody who
          has learnt where a control is should find it in the same place, and a
          row that changes width as a value crosses its default moves the two
          buttons beside it. The same bargain the emergency bar's add tool makes. */}
      <StepBtn
        onAction={revert}
        repeat={false}
        disabled={value === clamp(defaultValue)}
        label={`Reset ${name} to ${format(clamp(defaultValue))}`}
      >
        <ResetIcon />
      </StepBtn>
    </div>
  )
}

type ScrollAction = 'top' | 'up' | 'down' | 'bottom' | 'left' | 'right'

const SCROLL_LABELS: Record<ScrollAction, string> = {
  top: 'Go to top',
  up: 'Scroll up',
  down: 'Scroll down',
  bottom: 'Go to bottom',
  left: 'Scroll left',
  right: 'Scroll right',
}

/** Double-headed for the jumps, single for the nudges, so the pair differ at a glance. */
function ScrollGlyph({ action }: { action: ScrollAction }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      {action === 'top' && (
        <>
          <line x1="5" y1="5" x2="19" y2="5" />
          <polyline points="18 16 12 10 6 16" />
        </>
      )}
      {action === 'bottom' && (
        <>
          <line x1="5" y1="19" x2="19" y2="19" />
          <polyline points="6 8 12 14 18 8" />
        </>
      )}
      {action === 'up' && <polyline points="18 15 12 9 6 15" />}
      {action === 'down' && <polyline points="6 9 12 15 18 9" />}
      {action === 'left' && <polyline points="15 18 9 12 15 6" />}
      {action === 'right' && <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

function ScrollButton({
  action,
  onActivate,
  repeat,
  label,
  idle,
}: {
  action: ScrollAction
  onActivate: () => void
  repeat?: boolean
  /** What scrolls, where there is more than one thing on screen that could. */
  label?: string
  /** Nowhere to go this way: kept in its place, answering to nothing. */
  idle?: boolean
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, {
    repeatMs: repeat ? settings.repeatDelayMs : undefined,
    disabled: idle,
  })
  return (
    <div
      className={cx('pane-scroll-btn', active && 'dwelling', idle && 'is-idle')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label ?? SCROLL_LABELS[action]}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      <ScrollGlyph action={action} />
    </div>
  )
}

/**
 * How far one step moves a box: two lines of its 1.35rem type at 1.4, near
 * enough, so each step leaves a line from before on screen to read on from. A
 * nudge repeats while it is held, so this is the grain of the scroll rather than
 * its reach. One number for both boxes, being the same box in two places.
 */
const BOX_SCROLL_STEP = 60

/**
 * Up and down for a text box that scrolls itself — the message, and the
 * question heard.
 *
 * **Those were the two surfaces in this app with no way to scroll them by
 * dwell.** Both grow with what is in them up to a cap, and past the cap the rest
 * was scrolled out of the box with nothing to bring it back: a pane can hang its
 * controls above and below its content, but a textarea holds no children, so
 * there was nowhere to put them. They go *inside* the box's right edge instead,
 * in padding the box gives up only while they are there, so no word sits under
 * a control.
 *
 * **Only while there is somewhere to go**, one of each and never the jumps.
 * These ride a box somebody aims into for the caret, and every target added to it
 * is one more thing a rest meant for the words might land on; a nudge repeats
 * while it is held, so it crosses any distance the jumps would.
 */
export function BoxScroll({ edges, what }: { edges: ScrollEdges; what: string }) {
  const step = BOX_SCROLL_STEP
  if (!edges.canUp && !edges.canDown) return null
  return (
    <div className="box-scroll">
      {/* Both always drawn once either is, so each keeps its place: an arrow
          that came and went would move the other under a resting pointer. The
          one with nowhere to go is inert rather than absent — the rule the
          panes' rails follow, and the grid's. */}
      <ScrollButton
        action="up"
        repeat
        idle={!edges.canUp}
        label={`Scroll the ${what} up`}
        onActivate={() => edges.nudge(-step)}
      />
      <ScrollButton
        action="down"
        repeat
        idle={!edges.canDown}
        label={`Scroll the ${what} down`}
        onActivate={() => edges.nudge(step)}
      />
    </div>
  )
}

/**
 * A text box aimed at by dwell: resting places the caret, **going on resting
 * takes the word, then the lot**, which is how a gaze selects at all — see
 * `useCaretDwell`.
 *
 * Every single-line field in the app is one of these. A field you cannot put the
 * caret into is one you can only ever clear and retype; one you cannot *focus*
 * without a click is one Peri's own keyboard cannot type into either, since that
 * types into whatever field has the caret — which is how an API key or a sync
 * passphrase was set up on a board driven by gaze: it was not.
 *
 * `caret-field` carries the fill, painted as a background layer for the reason
 * the message box paints its own: an input can hold no children, so there is
 * nowhere to put a `.dwell-bar`. Anything else about how it looks is the
 * caller's class.
 */
export function DwellInput({ className, ref: outer, ...rest }: React.ComponentProps<'input'>) {
  const { settings } = useSettings()
  const inner = useRef<HTMLInputElement>(null)
  const { active, props } = useCaretDwell(inner, settings.actionDwellMs, { selectOnHold: true })
  const ref = useCallback(
    (el: HTMLInputElement | null) => {
      inner.current = el
      if (typeof outer === 'function') outer(el)
      else if (outer) outer.current = el
    },
    [outer],
  )
  return (
    <input
      ref={ref}
      className={cx('caret-field', className, active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      {...props}
      {...rest}
    />
  )
}

/**
 * A link aimed at by dwell. **This app had four plain anchors** — to the privacy
 * policy and the terms from the sign-in page and the guide, and the way back from
 * those pages — and a plain anchor answers to a click, which is the one input a
 * gaze user does not have. Somebody reading the policy by dwell could open it and
 * then had no way back to their board.
 *
 * **The same tab, always.** A new tab needs a click to be allowed, and a dwell is
 * a timer with no click in it, so opening one would be refused for exactly the
 * people this is for. These pages are the app's own and each has a way back,
 * which a tab somebody could not close would not.
 *
 * A real `<a>` underneath, so a mouse, a keyboard and a screen reader all find
 * the link they expect and the address shows where a browser shows addresses.
 */
export function DwellLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { settings } = useSettings()
  const go = useCallback(() => window.location.assign(href), [href])
  const { active, props } = useDwellControl(settings.actionDwellMs, go)
  return (
    <a
      href={href}
      className={cx('dwell-link', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      {...props}
      // The anchor would navigate on a click by itself, past the guard the dwell
      // hook's own click handler carries — a click landing in the second after the
      // screen moved is refused there, and has to be refused here too, since on a
      // gaze rig that sends real clicks the click *is* the dwell.
      onClick={e => {
        e.preventDefault()
        props.onClick()
      }}
    >
      {children}
    </a>
  )
}

/**
 * A scrollable area with dwell-driven controls, shown only when there is
 * somewhere to go. A dwell user has neither a scrollbar nor a wheel, so a pane
 * without these is a pane whose bottom half does not exist.
 *
 * Four of them, in the order the phrase grid's rail already uses: jump to the
 * top, nudge up, nudge down, jump to the bottom. Sixty voices or a screenful of
 * guide is a long way to travel 80 pixels at a time.
 */
export function ScrollPane({
  className = '',
  paneClassName = '',
  step = 80,
  children,
}: {
  className?: string
  paneClassName?: string
  step?: number
  children: React.ReactNode
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const { canUp, canDown, nudge, toTop, toBottom } = useScrollEdges(listRef)

  return (
    <div className={cx('scroll-pane', className)}>
      <div ref={listRef} className={cx('scroll-pane-inner', paneClassName)}>
        {children}
      </div>
      {/* **A rail on the right**, the shape the grid's has always had, rather
          than a bar across the top and another across the bottom. One place for
          everything that scrolls, so a gaze that has learnt where to go to move
          the board goes to the same edge to move a panel — and the bars cost
          the content two strips of height a short screen has no room for.

          Only while there is somewhere to go at all, so a pane that fits keeps
          its whole width. But then **all four, always**, the ones with nowhere
          to go kept in place and answering to nothing. The four share the
          rail's height, so one that came and went would stretch the others into
          the space it left — a control moving under a pointer resting on it.
          Ordered outward by how far each goes, as on the grid. */}
      {(canUp || canDown) && (
        <div className="pane-rail">
          <ScrollButton action="top" idle={!canUp} onActivate={toTop} />
          <ScrollButton action="up" idle={!canUp} repeat onActivate={() => nudge(-step)} />
          <ScrollButton action="down" idle={!canDown} repeat onActivate={() => nudge(step)} />
          <ScrollButton action="bottom" idle={!canDown} onActivate={toBottom} />
        </div>
      )}
    </div>
  )
}

/**
 * A line, with the icons it names drawn where they stand.
 *
 * `aria-hidden`, because the words either side already say what the control is:
 * a screen reader reading "rest on the speaker-icon button" twice over is worse
 * than one reading the sentence as written.
 */
function ProseLine({ line }: { line: string }) {
  return (
    <>
      {prosePieces(line).map((piece, i) => {
        if ('word' in piece) return piece.word
        const Icon = PROSE_ICONS[piece.icon]
        return Icon ? (
          <span key={i} className="prose-icon" aria-hidden="true">
            <Icon />
          </span>
        ) : null
      })}
    </>
  )
}

function ProseBlocks({ blocks }: { blocks: ProseSection['blocks'] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.kind === 'text' ? (
          <p key={i} className="help-text">
            <ProseLine line={block.text} />
          </p>
        ) : (
          <ul key={i} className="help-list">
            {block.items.map(item => (
              <li key={item}>
                <ProseLine line={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  )
}

/**
 * One section of the guide, with a heading that opens and closes it.
 *
 * The heading is a dwell control like everything else, so it carries its own
 * fill — a heading that answered to a rest without showing the rest happening
 * would look like the guide moving on its own.
 */
function CollapsibleSection({
  section,
  open,
  onToggle,
}: {
  section: ProseSection
  open: boolean
  onToggle: () => void
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onToggle)
  const ref = useRef<HTMLElement>(null)

  // Opening one puts its heading at the top of the pane, so what was just
  // chosen is the first thing on screen and its text runs downward from there.
  // Without it, opening a section low in the list leaves the heading where it
  // was and the text below the fold — and the reader has to find the scroll
  // arrows to see what they asked for.
  //
  // After the render that opened it, so the layout it scrolls to is the one with
  // the section already expanded and the previous one already closed. It runs on
  // mount too, for the section that starts open; the pane is at the top then, so
  // that is a scroll to where it already is.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [open])

  return (
    <section ref={ref} className={cx('help-section', 'is-collapsible', open && 'is-open')}>
      <h3
        className={cx('help-section-title', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-expanded={open}
        {...props}
      >
        <span className="help-section-caret" aria-hidden="true" />
        {section.title}
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
      </h3>
      {/* Unmounted rather than hidden: the whole guide left in the tree would
          have a screen reader read out fifteen sections the user has closed. */}
      {open && <ProseBlocks blocks={section.blocks} />}
    </section>
  )
}

/**
 * The guide and the legal pages are the same shape of text, so they are drawn by
 * the same thing. Only the guide collapses.
 *
 * The legal pages are documents — served at their own URLs, indexed, and read by
 * people checking one clause. Folding them up would hide most of what they exist
 * to say behind fifteen dwells. The guide is the opposite: somebody opens it
 * looking for one thing, and a screenful of headings is how they find which.
 */
export function ProseSections({
  sections,
  collapsible = false,
}: {
  sections: ProseSection[]
  collapsible?: boolean
}) {
  // The first is open, the rest are closed. Somebody arriving reads the overview
  // and sees the titles of everything else without scrolling past it.
  const [openTitle, setOpenTitle] = useState<string | null>(sections[0]?.title ?? null)

  if (!collapsible) {
    return (
      <>
        {sections.map(section => (
          <section key={section.title} className="help-section">
            <h3 className="help-section-title">{section.title}</h3>
            <ProseBlocks blocks={section.blocks} />
          </section>
        ))}
      </>
    )
  }

  return (
    <>
      {sections.map(section => (
        <CollapsibleSection
          key={section.title}
          section={section}
          open={openTitle === section.title}
          // One at a time. Fifteen sections all open is the uncollapsed guide
          // with extra steps, and closing the last one by hand is a dwell spent
          // on tidying rather than on reading.
          onToggle={() => setOpenTitle(current => (current === section.title ? null : section.title))}
        />
      ))}
    </>
  )
}

/**
 * An action inside a panel — save, cancel, link, replace. `danger` is for the
 * ones that take something away.
 */
export function PanelButton({
  label,
  kind,
  onActivate,
  disabled,
}: {
  label: string
  kind: 'primary' | 'plain' | 'danger'
  onActivate: () => void
  disabled?: boolean
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled })
  return (
    <div
      className={cx('panel-btn', kind, active && 'dwelling', disabled && 'is-disabled')}
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

/**
 * A grid of choices, full screen.
 *
 * Some lists in this app are too long for a control inside a panel — sixty
 * voices in a 186px dropdown was the worst of them. Those take the screen
 * instead, in the same shape the slot picker uses: big targets, dwell-scrollable,
 * and one way out that is always in the same place.
 *
 * Rendered at the body rather than where it sits in the tree. A panel it opens
 * from is animated with `transform`, and a transformed ancestor makes
 * `position: fixed` resolve against that ancestor instead of the viewport — the
 * modal comes out squeezed inside the panel, a few hundred pixels wide.
 */
/**
 * The control a full-screen picker opens from: what is chosen now, and a
 * chevron saying there is more behind it.
 *
 * A dwell rather than a `<select>`, for the reason every choice in this app is
 * one — an operating system draws a native list *outside* the page, where
 * nothing can be hovered and so nothing can be dwelled on.
 */
export function PickerTrigger({
  label,
  name,
  onOpen,
  open = false,
  className = '',
}: {
  label: string
  /** What a screen reader hears. The visible label is usually only half of it. */
  name: string
  onOpen: () => void
  open?: boolean
  className?: string
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onOpen)
  return (
    <div
      className={cx('picker-trigger', className, active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={name}
      {...props}
    >
      <span className="picker-trigger-label">{label}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="14"
        height="14"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

export function PickerModal({
  title,
  hint,
  filters,
  onDone,
  onCancel,
  children,
}: {
  title: string
  /** One line under the title saying how the grid behaves. */
  hint?: string
  /** A row of chips above the grid, for narrowing a long one. */
  filters?: React.ReactNode
  onDone: () => void
  onCancel: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div className="picker-modal-scrim">
      <div className="picker-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="picker-modal-head">
          <div className="picker-modal-heading">
            <span className="picker-modal-title">{title}</span>
            {hint && <span className="picker-modal-hint">{hint}</span>}
          </div>
          <div className="picker-modal-actions">
            <PanelButton kind="plain" label="Cancel" onActivate={onCancel} />
            <PanelButton kind="primary" label="Done" onActivate={onDone} />
          </div>
        </div>
        {filters && (
          <div className="picker-filters">
            <ScrollRow>{filters}</ScrollRow>
          </div>
        )}
        <ScrollPane className="picker-modal-scroller" paneClassName="picker-modal-body" step={160}>
          <div className="picker-grid" role="listbox" aria-label={title}>
            {children}
          </div>
        </ScrollPane>
      </div>
    </div>,
    document.body,
  )
}

/** One choice in a `PickerModal`. */
export function PickerTile({
  name,
  detail,
  selected,
  className,
  onSelect,
}: {
  name: string
  /** The smaller second line — where a voice came from, what a category holds. */
  detail?: string
  selected: boolean
  className?: string
  onSelect: () => void
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onSelect)
  return (
    <div
      className={cx('picker-tile', selected && 'is-selected', className, active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="option"
      aria-selected={selected}
      aria-label={detail ? `${name} · ${detail}` : name}
      {...props}
    >
      <span className="picker-tile-name">{name}</span>
      {detail && <span className="picker-tile-detail">{detail}</span>}
      {/* A mark as well as the colour. Green is the app's "selected" cue
          everywhere, and in a grid where several can be on at once, colour alone
          is a poor thing to read a whole screen by. */}
      {selected && (
        <span className="picker-tile-check" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="12"
            height="12"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

/**
 * A row that scrolls sideways, with dwell arrows shown only when it does.
 *
 * The filter chips outgrow the screen as soon as an account has a few
 * collections in it, and a row with no arrows is a row whose far end does not
 * exist for anybody without a wheel. Two rather than the four a vertical pane
 * gets: this is a handful of chips, and the modal's header is busy enough.
 */
export function ScrollRow({ children }: { children: React.ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 0)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = rowRef.current
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

  const scrollBy = useCallback((dx: number) => rowRef.current?.scrollBy({ left: dx, behavior: 'smooth' }), [])

  return (
    <div className="scroll-row">
      {canLeft && <ScrollButton action="left" repeat onActivate={() => scrollBy(-160)} />}
      <div ref={rowRef} className="scroll-row-inner">
        {children}
      </div>
      {canRight && <ScrollButton action="right" repeat onActivate={() => scrollBy(160)} />}
    </div>
  )
}

/** One chip in a `PickerModal`'s filter row. */
export function PickerFilter({
  label,
  count,
  active,
  onSelect,
}: {
  label: string
  /** How many the chip would leave on screen, so an empty one is visibly empty. */
  count: number
  active: boolean
  onSelect: () => void
}) {
  const { settings } = useSettings()
  const { active: dwelling, props } = useDwellControl(settings.actionDwellMs, onSelect)
  return (
    <div
      className={cx('picker-filter', active && 'is-active', dwelling && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-pressed={active}
      aria-label={`${label}, ${count} ${count === 1 ? 'voice' : 'voices'}`}
      {...props}
    >
      <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
      {label}
      <span className="picker-filter-count">{count}</span>
    </div>
  )
}

/**
 * The one thing on screen that says "wait".
 *
 * Deliberately **not a control**: no dwell, no target, nothing to aim at, and
 * `pointer-events: none` so it cannot take a gaze that was on its way past. It
 * is fixed above everything, because both things it reports on happen while a
 * panel is covering the board — synchronizing from the settings row, and
 * re-parsing the table from the Aliases panel.
 */
export function BusyIndicator({ busy, label }: { busy: boolean; label: string }) {
  const shown = useSettled(busy)
  return (
    <div className="busy-region" role="status" aria-live="polite">
      {shown && (
        <div className="busy">
          <span className="busy-spinner" aria-hidden="true" />
          {label}
        </div>
      )}
    </div>
  )
}

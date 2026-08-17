
// The controls every screen is built from.
//
// All of them are dwell-first: `useDwellControl` handles hover-and-hold, tap and
// Enter/Space together, and each one renders the fill bar that shows a dwell in
// progress. Anything here is used by more than one screen — a control with a
// single caller lives with its caller.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDwellControl } from './dwell'
import { useSettings } from './settings'
import { ResetIcon } from './icons'
import type { ProseSection } from '../core/prose'
import { cx, dwellVar } from './style'

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

export function NavItem({ icon, label, sublabel, onSelect }: {
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

export function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function StepBtn({ onAction, children, label, repeat = true, disabled }: {
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

export function SettingSpinner({ value, min, max, step, format, onValue, defaultValue, name }: {
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
      {action === 'top' && <><line x1="5" y1="5" x2="19" y2="5" /><polyline points="18 16 12 10 6 16" /></>}
      {action === 'bottom' && <><line x1="5" y1="19" x2="19" y2="19" /><polyline points="6 8 12 14 18 8" /></>}
      {action === 'up' && <polyline points="18 15 12 9 6 15" />}
      {action === 'down' && <polyline points="6 9 12 15 18 9" />}
      {action === 'left' && <polyline points="15 18 9 12 15 6" />}
      {action === 'right' && <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

function ScrollButton({ action, onActivate, repeat }: {
  action: ScrollAction
  onActivate: () => void
  repeat?: boolean
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, {
    repeatMs: repeat ? settings.repeatDelayMs : undefined,
  })
  return (
    <div
      className={cx('pane-scroll-btn', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={SCROLL_LABELS[action]}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      <ScrollGlyph action={action} />
    </div>
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
export function ScrollPane({ className = '', paneClassName = '', step = 80, children }: {
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
  const scrollTo = useCallback((top: number) => listRef.current?.scrollTo({ top, behavior: 'smooth' }), [])

  return (
    <div className={cx('scroll-pane', className)}>
      {canUp && (
        <div className="pane-scroll-row">
          <ScrollButton action="top" onActivate={() => scrollTo(0)} />
          <ScrollButton action="up" repeat onActivate={() => scrollBy(-step)} />
        </div>
      )}
      <div ref={listRef} className={cx('scroll-pane-inner', paneClassName)}>
        {children}
      </div>
      {canDown && (
        <div className="pane-scroll-row">
          <ScrollButton action="down" repeat onActivate={() => scrollBy(step)} />
          <ScrollButton action="bottom" onActivate={() => scrollTo(listRef.current?.scrollHeight ?? 0)} />
        </div>
      )}
    </div>
  )
}

function ProseBlocks({ blocks }: { blocks: ProseSection['blocks'] }) {
  return (
    <>
      {blocks.map((block, i) =>
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
function CollapsibleSection({ section, open, onToggle }: {
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
export function ProseSections({ sections, collapsible = false }: {
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
export function PanelButton({ label, kind, onActivate, disabled }: {
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
export function PickerModal({ title, hint, filters, onDone, onCancel, children }: {
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
export function PickerTile({ name, detail, selected, className, onSelect }: {
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
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

  const scrollBy = useCallback(
    (dx: number) => rowRef.current?.scrollBy({ left: dx, behavior: 'smooth' }),
    [],
  )

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
export function PickerFilter({ label, count, active, onSelect }: {
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

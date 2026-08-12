
// The controls every screen is built from.
//
// All of them are dwell-first: `useDwellControl` handles hover-and-hold, tap and
// Enter/Space together, and each one renders the fill bar that shows a dwell in
// progress. Anything here is used by more than one screen — a control with a
// single caller lives with its caller.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDwellControl } from './dwell'
import { useSettings } from './settings'
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

export function SettingSpinner({ value, min, max, step, format, onValue }: {
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

type ScrollAction = 'top' | 'up' | 'down' | 'bottom'

const SCROLL_LABELS: Record<ScrollAction, string> = {
  top: 'Go to top',
  up: 'Scroll up',
  down: 'Scroll down',
  bottom: 'Go to bottom',
}

/** Double-headed for the jumps, single for the nudges, so the pair differ at a glance. */
function ScrollGlyph({ action }: { action: ScrollAction }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
      {action === 'top' && <><line x1="5" y1="5" x2="19" y2="5" /><polyline points="18 16 12 10 6 16" /></>}
      {action === 'bottom' && <><line x1="5" y1="19" x2="19" y2="19" /><polyline points="6 8 12 14 18 8" /></>}
      {action === 'up' && <polyline points="18 15 12 9 6 15" />}
      {action === 'down' && <polyline points="6 9 12 15 18 9" />}
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
    repeatMs: repeat ? 180 : undefined,
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

export function ProseSections({ sections }: { sections: ProseSection[] }) {
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

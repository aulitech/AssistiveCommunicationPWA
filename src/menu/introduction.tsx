// **Getting started**: the guide, one part at a time, at whatever pace the
// person reading it keeps — see docs/decisions/getting-started.md.
//
// **The parts are the guide's own sections**, drawn by the same `ProseSections`
// Menu → Help draws them with. Two texts saying how the board works would be two
// texts to keep in step, and the first time they disagreed somebody would learn
// the board from the wrong one — so there is one, and this is a second way
// through it: in order, a section a screen, with a note of how far they got.
//
// It stands where the message box, the tabs and the grid are while it is open,
// and **the emergency bar stays under it**, live. Somebody signing in for the
// first time is exactly who might need the bar before they have read a word.

import { useCallback, useEffect, useState } from 'react'
import { HELP_SECTIONS } from './help'
import { loadCovered, saveCovered, type Covered } from '../core/store'
import { PanelButton, ProseSections, ScrollPane } from '../ui/controls'
import { holdDwells, useDwellControl } from '../ui/dwell'
import { CheckIcon } from '../ui/icons'
import { useSettings } from '../ui/settings'
import { cx, dwellVar } from '../ui/style'

/** Every part, in the guide's order. */
const PARTS = HELP_SECTIONS

/** When a part was covered, as a person would say it. */
const coveredOn = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * A box that is ticked or not, worked by resting on it like everything else.
 * There is no native checkbox in the app: a rest raises no click, so an
 * `<input type="checkbox">` is one more control a dwell cannot reach.
 */
function DwellCheckbox({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onToggle)
  return (
    <div
      className={cx('dwell-checkbox', checked && 'is-checked', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      {...props}
    >
      <span className="dwell-checkbox-box" aria-hidden="true">
        {checked && <CheckIcon />}
      </span>
      <span className="dwell-checkbox-label">{label}</span>
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

/** One line of the outline: its number, its title, and when it was covered. */
function OutlineRow({
  number,
  title,
  at,
  onOpen,
}: {
  number: number
  title: string
  at: number | undefined
  onOpen: () => void
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onOpen)
  return (
    <li>
      <div
        className={cx('outline-row', at !== undefined && 'is-covered', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-label={`${number}. ${title}${at !== undefined ? `, covered ${coveredOn(at)}` : ''}`}
        {...props}
      >
        <span className="outline-number">{number}</span>
        <span className="outline-title">{title}</span>
        {at !== undefined && (
          <span className="outline-covered">
            <span className="outline-tick" aria-hidden="true">
              <CheckIcon />
            </span>
            {coveredOn(at)}
          </span>
        )}
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
      </div>
    </li>
  )
}

export function Introduction({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings()
  /** Which part is open, or null for the first page: what this is, the checkbox, and the outline. */
  const [part, setPart] = useState<number | null>(null)
  const [covered, setCovered] = useState<Covered>(loadCovered)

  const count = PARTS.filter(p => covered[p.title] !== undefined).length
  /** Where Continue goes: the first part not yet covered, or -1 when every one has been. */
  const nextUncovered = PARTS.findIndex(p => covered[p.title] === undefined)

  /**
   * **Every page arrives under a pointer that has not moved** — the one that
   * signed in, and after that the one that rested on Next — so each goes deaf
   * for a moment first, the rule for anything that moves the screen.
   */
  const go = useCallback((to: number | null) => {
    holdDwells()
    setPart(to)
  }, [])
  useEffect(() => {
    holdDwells()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** A part is covered by moving on from it, which is somebody saying they have read it. */
  const cover = (index: number) => {
    const next = { ...loadCovered(), [PARTS[index].title]: Date.now() }
    saveCovered(next)
    setCovered(next)
  }

  const onward = () => {
    if (part === null) return go(nextUncovered === -1 ? 0 : nextUncovered)
    cover(part)
    // The last part goes back to the outline, every tick on it, rather than
    // closing: that is the one screen that says it is finished.
    go(part === PARTS.length - 1 ? null : part + 1)
  }

  const onwardLabel =
    part !== null
      ? part === PARTS.length - 1
        ? 'Finish'
        : 'Next'
      : count === 0
        ? 'Start'
        : nextUncovered === -1
          ? 'Start again'
          : 'Continue'

  return (
    <section className="introduction" aria-label="Getting started">
      <header className="introduction-head">
        <div className="introduction-heading">
          <h2 className="introduction-title">Getting started</h2>
          <span className="introduction-progress">
            {part !== null ? `Part ${part + 1} of ${PARTS.length} · ` : ''}
            {count} of {PARTS.length} covered
          </span>
        </div>
        {/* Both always there, the outline quiet on the outline: a control that
            came and went would move the one beside it under a resting pointer. */}
        <div className="introduction-actions">
          <PanelButton kind="plain" label="Outline" disabled={part === null} onActivate={() => go(null)} />
          <PanelButton kind="plain" label="Close" onActivate={onClose} />
        </div>
      </header>

      {/* Keyed by the page, so each opens at its top rather than wherever the
          last was scrolled to. */}
      <ScrollPane key={part ?? 'outline'} className="help-scroller" paneClassName="help-body" step={120}>
        <div className="help-measure">
          {part === null ? (
            <>
              <p className="help-text">
                Peri, one part at a time. Each part is a section of the guide under Menu → Help, word for word, so
                anything here can be found there again. Go at your own pace: close this whenever you like, and the
                outline below keeps a tick against every part you have been through.
              </p>
              <DwellCheckbox
                checked={!settings.introduction}
                label="Don't show this at sign-in"
                onToggle={() => update({ introduction: !settings.introduction })}
              />
              <p className="help-text introduction-aside">
                You can open it again, or have it back at sign-in, from Settings.
              </p>
              <h3 className="help-section-title">Outline</h3>
              <ol className="introduction-outline">
                {PARTS.map((p, i) => (
                  <OutlineRow
                    key={p.title}
                    number={i + 1}
                    title={p.title}
                    at={covered[p.title]}
                    onOpen={() => go(i)}
                  />
                ))}
              </ol>
            </>
          ) : (
            <ProseSections sections={[PARTS[part]]} />
          )}
        </div>
      </ScrollPane>

      <footer className="introduction-foot">
        <PanelButton
          kind="plain"
          label="Back"
          disabled={part === null}
          onActivate={() => go(part === null || part === 0 ? null : part - 1)}
        />
        <PanelButton kind="primary" label={onwardLabel} onActivate={onward} />
      </footer>
    </section>
  )
}

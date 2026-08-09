// The bar across the top: the message being composed, and the controls that act
// on it. Rest sits here too — straddling the top edge of the message box, in the
// middle of the screen's top where a gaze on its way anywhere passes, and taking
// no height from the grid.

import { useCallback, useState } from 'react'
import { useSettings } from './settings'
import { useDwellControl } from './dwell'
import { ClearIcon, CopyIcon, MenuIcon, SpeakIcon, UndoIcon } from './icons'
import { cx, dwellVar } from './style'
import type { Composer } from './use-composer'

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

export function Topbar({ composer, editMode, menuOpen, onToggleMenu, resting, onToggleRest, onAddPhrase, onSpeak, onCopy }: {
  composer: Composer
  editMode: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  resting: boolean
  onToggleRest: () => void
  /** Turn what is composed into a phrase of its own. Edit mode only. */
  onAddPhrase: () => void
  /** Both of these are how a message leaves, which the screen keeps a record of. */
  onSpeak: () => void
  onCopy: () => void
}) {
  const { settings } = useSettings()
  const { text, setText, showUndo, canClear, clearOrUndo, focus, focused, setFocused, textareaRef, trackCursor } =
    composer

  // Hover-and-hold on the message box, doing whichever of its two jobs applies.
  // Both were previously reachable only by clicking — the one input a
  // dwell-only user cannot produce.
  //
  //  * In edit mode it opens the editor; adding an ordinary phrase has no other
  //    entry point.
  //  * Otherwise it moves focus there, so the caret can be placed and typed at
  //    without a click.
  const handleDwell = useCallback(() => {
    if (editMode) onAddPhrase()
    else focus()
  }, [editMode, onAddPhrase, focus])

  // Once the box holds focus there is nothing left for a hold to do, so it
  // stops arming — a pointer resting there while the user types should not keep
  // lighting up a progress bar.
  const dwell = useDwellControl(settings.actionDwellMs, handleDwell, {
    disabled: !editMode && focused,
  })

  return (
    <header className="topbar">
      {/* Straddling the top edge of the message box — the middle of the
          screen's top, where a gaze on its way anywhere passes. Costs the
          grid no height at all. */}
      <RestButton resting={resting} onToggle={onToggleRest} />

      <ActionButton label={menuOpen ? 'Close menu' : 'Open menu'} onSelect={onToggleMenu} className="menu-btn">
        <MenuIcon />
      </ActionButton>

      <ActionButton
        className="left"
        onSelect={clearOrUndo}
        label={showUndo ? 'Undo' : 'Clear'}
        disabled={!canClear}
      >
        {showUndo ? <UndoIcon /> : <ClearIcon />}
      </ActionButton>

      <textarea
        ref={textareaRef}
        className={cx('text-display', dwell.active && 'dwelling')}
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerEnter={dwell.props.onPointerEnter}
        onPointerLeave={dwell.props.onPointerLeave}
        onClick={e => {
          trackCursor(e)
          if (editMode) dwell.props.onClick()
        }}
        // The handler cancels Space so it cannot scroll the grid, and the
        // hook's own disabled check already stops that outside edit mode —
        // but that check reads a ref synced in an effect, and this is the
        // one surface where swallowing a space is unacceptable.
        onKeyDown={editMode ? dwell.props.onKeyDown : undefined}
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

      <ActionButton className="right" onSelect={onSpeak} label="Speak" disabled={!text}>
        <SpeakIcon />
      </ActionButton>

      <ActionButton className="right" onSelect={onCopy} label="Copy to clipboard" disabled={!text}>
        <CopyIcon />
      </ActionButton>
    </header>
  )
}

// The bar across the top: the message being composed, and the controls that act
// on it. All three of the app's modes sit here too — edit, Rest, auto-speak —
// in a strip straddling the top edge of the message box, in the middle of the
// screen's top where a gaze on its way anywhere passes.
//
// The strip is centred on the box's top border and overlaps the box, rather than
// sitting in a band above it — a band wide enough for two icons cost the grid
// 18px, and riding on the border costs 2px. What it costs instead is the
// top-centre of the message box, which now answers to a mode rather than to the
// caret. Rest was already there, so that surface was never entirely the box's.

import { useCallback, useState } from 'react'
import { useSettings } from '../ui/settings'
import { useCaretDwell } from '../ui/caret'
import { useDwellControl } from '../ui/dwell'
import { useLinkInput, type PasteResult } from '../ui/link-input'
import { AutoSpeakIcon, ClearIcon, CopyIcon, EditIcon, MenuIcon, PasteIcon, SpeakIcon, UndoIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
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
 * A mode toggle — auto-speak, or edit. Both used to sit at the top of the grid
 * rail; they are here now, either side of Rest, because all three are modes and
 * Rest was already here. The rail is left to scrolling.
 *
 * Small, because the strip they share with Rest is a strip rather than a row,
 * and Rest is half a rem of it. So each takes the same treatment Rest does: the
 * painted size is small and the area answering to a pointer is larger and
 * invisible — see `.mode-btn::before`.
 */
function ModeToggle({ on, onToggle, label, className, children }: {
  on: boolean
  onToggle: () => void
  label: string
  className: string
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onToggle)
  return (
    <div
      className={cx('mode-btn', className, on && 'active', active && 'dwelling')}
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

export function Topbar({ composer, editMode, onToggleEdit, autoSpeak, onToggleAutoSpeak, menuOpen, onToggleMenu, resting, onToggleRest, onAddPhrase, onSpeak, onCopy, onPasted }: {
  composer: Composer
  editMode: boolean
  onToggleEdit: () => void
  autoSpeak: boolean
  onToggleAutoSpeak: () => void
  menuOpen: boolean
  onToggleMenu: () => void
  resting: boolean
  onToggleRest: () => void
  /** Turn what is composed into a phrase of its own. Edit mode only. */
  onAddPhrase: () => void
  /** Both of these are how a message leaves, which the screen keeps a record of. */
  onSpeak: () => void
  onCopy: () => void
  /** Says what came of asking, so the screen can report a refusal out loud. */
  onPasted: (result: PasteResult) => void
}) {
  const { settings } = useSettings()
  const { text, setText, showUndo, canClear, clearOrUndo, textareaRef, trackCursor, setCursor } = composer

  // The box is two different things, so a hold on it is two different dwells,
  // each switched off in the other's mode. Both were reachable only by clicking
  // before — the one input a dwell-only user cannot produce.
  //
  //  * **In edit mode the box is a button.** It is `readOnly`, holds no caret
  //    to place, and holding it opens the editor — the only entry point there
  //    is for adding an ordinary phrase.
  //  * **Otherwise it is a box being written in**, and holding it puts the
  //    caret where the pointer is. Which matters more here than in the phrase
  //    editor: the caret decides which word the grid narrows itself to, so
  //    placing it is how a gaze user says which word to finish.
  const dwell = useDwellControl(settings.actionDwellMs, onAddPhrase, { disabled: !editMode })

  // The gate here used to be `focused` — the box stopped arming altogether once
  // it held focus, so a pointer resting on it while its owner typed would not
  // flash a progress bar at them. That also made the caret placeable exactly
  // once, on the way in, and never again. Aiming is what actually settles it: a
  // pointer that has not moved does not re-arm, whether the box has focus or not.
  const caret = useCaretDwell(textareaRef, settings.actionDwellMs, {
    disabled: editMode,
    onPlace: setCursor,
  })

  // A link pasted or dropped here becomes `[label](url)`, so the message reads
  // as the page's name and still carries the address when it is copied out.
  const linkInput = useLinkInput(
    textareaRef,
    useCallback(
      (next: string, caret: number) => {
        setText(next)
        const el = textareaRef.current
        if (!el) return
        // After the value React is about to render, or the caret is placed in
        // the old one and jumps to the end.
        setTimeout(() => {
          el.selectionStart = el.selectionEnd = caret
          el.focus()
        }, 0)
      },
      [setText, textareaRef],
    ),
  )

  // Asking is asynchronous and can be refused, so what came of it goes back to
  // the screen to be said out loud rather than being swallowed here.
  const paste = useCallback(() => {
    void linkInput.pasteFromClipboard().then(onPasted)
  }, [linkInput, onPasted])

  return (
    <header className="topbar">
      {/* The three modes, straddling the top edge of the message box — the
          middle of the screen's top, where a gaze on its way anywhere passes.
          Edit and auto-speak came up from the grid rail to join Rest, which was
          always here: they are the same kind of thing, and a mode is worth more
          on the path a gaze already takes than at the end of a rail.

          Rest keeps the centre. It is the one control that has to be findable
          without looking, and it was found there. */}
      <div className="topbar-modes">
        <ModeToggle
          className="edit-toggle"
          on={editMode}
          onToggle={onToggleEdit}
          label={editMode ? 'Exit edit mode' : 'Edit phrases'}
        >
          <EditIcon />
        </ModeToggle>

        <RestButton resting={resting} onToggle={onToggleRest} />

        <ModeToggle
          className="autospeak-toggle"
          on={autoSpeak}
          onToggle={onToggleAutoSpeak}
          label={autoSpeak ? 'Turn off auto-speak' : 'Turn on auto-speak — speak phrases immediately'}
        >
          <AutoSpeakIcon />
        </ModeToggle>
      </div>

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
        className={cx('text-display', (dwell.active || caret.active) && 'dwelling')}
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
        onPaste={linkInput.onPaste}
        onDrop={linkInput.onDrop}
        onDragOver={linkInput.onDragOver}
        // Both dwells get every pointer event; each is disabled in the other's
        // mode, so only one of them is ever armed by them.
        onPointerEnter={e => {
          dwell.props.onPointerEnter?.()
          caret.props.onPointerEnter(e)
        }}
        onPointerMove={caret.props.onPointerMove}
        onPointerLeave={() => {
          dwell.props.onPointerLeave()
          caret.props.onPointerLeave()
        }}
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

      {/* Beside copy, because they are the pair. The keyboard route into this box
          is Ctrl-V, which a dwell user does not have — so a control asks on their
          behalf. Never disabled: what is on the clipboard is not this app's to
          know until it asks, so a paste that turns out to have nothing behind it
          says so rather than being greyed out on a guess. */}
      <ActionButton className="right" onSelect={paste} label="Paste from clipboard">
        <PasteIcon />
      </ActionButton>
    </header>
  )
}

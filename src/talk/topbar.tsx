// The bar across the top: the message being composed, and the controls that act
// on it — or, in edit mode, the phrase being written and the controls that act on
// *that*. All three of the app's modes sit here too — edit, Rest, auto-speak —
// in a strip straddling the top edge of the message box, in the middle of the
// screen's top where a gaze on its way anywhere passes.
//
// **The box is the phrase editor in edit mode.** There was a dialog for that,
// which covered the very phrases being edited and had to be got out of before
// anything else could be reached. So the one box does both jobs and the rail
// beside it changes with the mode: speak, copy and paste become save, delete and
// paste. The controls stay in the same places, which is what makes the mode a
// change of meaning rather than a change of layout.
//
// The strip is centred on the box's top border and overlaps the box, rather than
// sitting in a band above it — a band wide enough for two icons cost the grid
// 18px, and riding on the border costs 2px. What it costs instead is the
// top-centre of the message box, which now answers to a mode rather than to the
// caret. Rest was already there, so that surface was never entirely the box's.

import { useCallback, useEffect, useState } from 'react'
import { useSettings } from '../ui/settings'
import { useCaretDwell } from '../ui/caret'
import { useDwellControl } from '../ui/dwell'
import { useLinkInput, type PasteResult } from '../ui/link-input'
import { AutoSpeakIcon, CheckIcon, ClearIcon, CopyIcon, EditIcon, MenuIcon, PasteIcon, PlusIcon, SpeakIcon, TrashIcon, UndoIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { PhraseEditBar } from './editors'
import type { Composer } from './use-composer'
import type { Editor } from './use-editor'

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

export function Topbar({ composer, editor, editMode, onToggleEdit, autoSpeak, onToggleAutoSpeak, menuOpen, onToggleMenu, resting, onToggleRest, onSavePhrase, onDeletePhrase, categories, countFor, onCreateCategory, onSpeak, onCopy, onPasted }: {
  composer: Composer
  /** The phrase being written, which in edit mode is what the box holds. */
  editor: Editor
  editMode: boolean
  onToggleEdit: () => void
  autoSpeak: boolean
  onToggleAutoSpeak: () => void
  menuOpen: boolean
  onToggleMenu: () => void
  resting: boolean
  onToggleRest: () => void
  /** Both of these change the board, so the screen does them, not the editor. */
  onSavePhrase: () => void
  onDeletePhrase: () => void
  /** For the strip on the box's lower border: what a phrase can be filed under. */
  categories: string[]
  countFor: (name: string) => number
  onCreateCategory: () => void
  /** Both of these are how a message leaves, which the screen keeps a record of. */
  onSpeak: () => void
  onCopy: () => void
  /** Says what came of asking, so the screen can report a refusal out loud. */
  onPasted: (result: PasteResult) => void
}) {
  const { settings } = useSettings()
  const { text, setText, showUndo, canClear, clearOrUndo, textareaRef, trackCursor, setCursor } = composer
  const { draft, isUntouched, startNew, setText: setDraftText } = editor

  // One box, two things in it: the message being composed, and — in edit mode —
  // the phrase being written. Which one is showing decides everything below,
  // because a keystroke has to go to the right one of the two.
  const write = editMode ? setDraftText : setText

  // The same dwell either way, and enabled in both modes now. The box used to be
  // `readOnly` in edit mode, a button whose hold opened the editor dialog; there
  // is no dialog to open any more, so it is a box being typed in whichever mode
  // it is in. Outside edit mode the caret does a second job — it decides which
  // word the grid narrows itself to, which is how a gaze user says which word to
  // finish — so where it lands is reported back to the composer.
  const caret = useCaretDwell(textareaRef, settings.actionDwellMs, {
    onPlace: editMode ? undefined : setCursor,
  })

  /**
   * The box grows with what is in it, up to a few lines.
   *
   * It was one line, fixed, with the overflow scrolled and the scrollbar hidden
   * — so a message longer than the box went above the fold and stayed there.
   * Every other surface in this app has dwell controls for scrolling; this one
   * has none, and nothing to hang them on, so what scrolls out of it is gone as
   * far as a gaze user is concerned.
   *
   * Measured rather than counted: a line is however many characters fit at this
   * text size and this width, which is not a number this can know. The cap is in
   * the stylesheet, where `max-height` clamps whatever is set here — so the box
   * cannot eat the board however long the message gets.
   *
   * **Where nothing can be measured, nothing is set.** `scrollHeight` is 0 in
   * jsdom, and a box set to nought is a box nobody can see; the same fallback
   * the grid's windowing makes, for the same reason.
   */
  const value = editMode ? draft.text : text
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const fit = () => {
      // Back to one line first, or the box only ever grows: `scrollHeight`
      // includes whatever height it is already holding.
      el.style.height = ''
      if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`
    }
    fit()
    // The width decides where the lines break, and the width changes with the
    // window — a phone turned on its side rewraps every line in the box.
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [value, textareaRef, settings.zoom])

  // A link pasted or dropped here becomes `[label](url)`, so the message reads
  // as the page's name and still carries the address when it is copied out. Into
  // whichever of the two the box is showing.
  const linkInput = useLinkInput(
    textareaRef,
    useCallback(
      (next: string, caret: number) => {
        write(next)
        const el = textareaRef.current
        if (!el) return
        // After the value React is about to render, or the caret is placed in
        // the old one and jumps to the end.
        setTimeout(() => {
          el.selectionStart = el.selectionEnd = caret
          el.focus()
        }, 0)
      },
      [write, textareaRef],
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
          without looking, and it was found there.

          Edit and auto-speak are exclusive of one another — the board cannot be
          both a thing being spoken from and a thing being rewritten — so each
          reads as pressed only while it is the one that is on, and switching one
          on switches the other off. */}
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

      {/* The left slot empties the box in both modes — of the message, or of the
          phrase being written along with whatever it was pointed at. */}
      {editMode ? (
        <ActionButton
          className="left"
          onSelect={() => startNew()}
          label="Start a new phrase"
          disabled={isUntouched}
        >
          <PlusIcon />
        </ActionButton>
      ) : (
        <ActionButton
          className="left"
          onSelect={clearOrUndo}
          label={showUndo ? 'Undo' : 'Clear'}
          disabled={!canClear}
        >
          {showUndo ? <UndoIcon /> : <ClearIcon />}
        </ActionButton>
      )}

      <textarea
        ref={textareaRef}
        className={cx('text-display', caret.active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        aria-label={editMode ? 'Phrase text' : 'Composed message'}
        value={value}
        onChange={e => {
          write(e.target.value)
          if (!editMode) trackCursor(e)
        }}
        // Only outside edit mode: the caret tracked here is the composer's, and
        // it decides which word the grid filters on. A caret moved about in a
        // phrase would narrow the board to a word that is not in the message.
        onSelect={editMode ? undefined : trackCursor}
        onPaste={linkInput.onPaste}
        onDrop={linkInput.onDrop}
        onDragOver={linkInput.onDragOver}
        {...caret.props}
        onClick={editMode ? undefined : trackCursor}
        onKeyUp={editMode ? undefined : trackCursor}
        placeholder={
          editMode
            ? 'Write a phrase, or hold one on the board to edit it…'
            : settings.autoSpeak
              ? 'Auto-speak is on — phrases are spoken, not collected here'
              : 'Dwell on a phrase or type…'
        }
        rows={1}
        spellCheck
        autoCapitalize="sentences"
        // The board opens with the caret already in the box, so somebody with a
        // keyboard can type the first thing they want to say without having to
        // put it there first — and putting it there is the one thing a dwell
        // could not do until `useCaretDwell`. A programmatic focus does not
        // raise a phone's on-screen keyboard, which needs a real gesture.
        autoFocus
      />

      {/* Three on the right in both modes, in the same three places. Outside
          edit mode they are how a message leaves; inside it they are what
          becomes of the phrase in the box. Paste is the one that means the same
          thing either way, so it keeps its place at the end. */}
      {editMode ? (
        <>
          <ActionButton
            className="right"
            onSelect={onSavePhrase}
            label={draft.keeping ? 'Keep this message as a phrase' : 'Save phrase'}
            disabled={!draft.canSave}
          >
            <CheckIcon />
          </ActionButton>

          {/* Quiet rather than gone while there is nothing to delete: a control
              that comes and goes moves the ones beside it, and these are aimed
              at rather than read. */}
          <ActionButton
            className="right danger"
            onSelect={onDeletePhrase}
            label={draft.keeping ? 'Forget this message' : 'Delete phrase'}
            disabled={draft.isNew}
          >
            <TrashIcon />
          </ActionButton>
        </>
      ) : (
        <>
          <ActionButton className="right" onSelect={onSpeak} label="Speak" disabled={!text}>
            <SpeakIcon />
          </ActionButton>

          <ActionButton className="right" onSelect={onCopy} label="Copy to clipboard" disabled={!text}>
            <CopyIcon />
          </ActionButton>
        </>
      )}

      {/* Beside copy, because they are the pair. The keyboard route into this box
          is Ctrl-V, which a dwell user does not have — so a control asks on their
          behalf. Never disabled: what is on the clipboard is not this app's to
          know until it asks, so a paste that turns out to have nothing behind it
          says so rather than being greyed out on a guess. */}
      <ActionButton className="right" onSelect={paste} label="Paste from clipboard">
        <PasteIcon />
      </ActionButton>

      {/* The other strip, on the box's lower border, and centred on it exactly
          as the modes are on the upper one. A phrase has two things besides its
          words — where it is filed and how it sounds — and they belong to the
          box holding those words rather than to a band underneath it. */}
      {editMode && (
        <PhraseEditBar
          draft={draft}
          categories={categories}
          countFor={countFor}
          onCategory={editor.setCategory}
          onVoice={editor.setVoice}
          onCreateCategory={onCreateCategory}
        />
      )}
    </header>
  )
}

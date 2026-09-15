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

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '../ui/settings'
import { chooseLanguage, chooseVoice } from '../core/store'
import { LanguagePicker } from '../voice/language-picker'
import { VoicePicker } from '../voice/picker'
import { useCaretDwell } from '../ui/caret'
import { useDwellControl } from '../ui/dwell'
import { useLinkInput, type PasteResult } from '../ui/link-input'
import {
  AutoSpeakIcon,
  CheckIcon,
  ClearIcon,
  CopyIcon,
  EditIcon,
  KeyboardIcon,
  MenuIcon,
  MicIcon,
  PasteIcon,
  PlusIcon,
  SpeakIcon,
  TrashIcon,
  UndoIcon,
} from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { useSettled } from '../ui/settle'
import { PhraseEditBar } from './editors'
import type { Composer } from './use-composer'
import type { Editor } from './use-editor'
import type { Listener } from './use-listen'
import { HeardBox } from './heard'

function ActionButton({
  onSelect,
  className = '',
  children,
  label,
  disabled,
}: {
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
/**
 * Whether the screen has room for the language and voice controls.
 *
 * Asked in JavaScript rather than answered with `display: none`, so the
 * breakpoint is written once. Hiding them in CSS would still mount them, and
 * each subscribes to the device's voice list and builds one — work done on
 * every phone for two controls that phone never shows.
 */
const WIDE_ENOUGH = '(min-width: 1100px)'

function useWideScreen(): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_ENOUGH)
    if (!query) return
    const read = () => setWide(query.matches)
    read()
    query.addEventListener('change', read)
    return () => query.removeEventListener('change', read)
  }, [])
  return wide
}

/**
 * One of the two value controls at the box's upper-right corner.
 *
 * A face that says the value rather than a glyph that says the subject: `en-US`
 * and `Samantha` tell somebody what the board will do, where a globe and a
 * waveform only say which grid opens. Six rem is what a border can spare, and
 * what does not fit is on the control for a screen reader rather than lost.
 *
 * `on` is *the grid is open*, not *switched on* — there is nothing to switch.
 * It reads pressed while its grid is up for the reason every picker trigger
 * here does: a full-screen grid covers the control that opened it, and coming
 * back to something that never looked pressed is disorienting.
 */
function ChoiceButton({
  label,
  on,
  onOpen,
  children,
}: {
  label: string
  on: boolean
  onOpen: () => void
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onOpen)
  return (
    <div
      className={cx('choice-btn', on && 'active', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={on}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      <span className="choice-btn-face">{children}</span>
    </div>
  )
}

function ModeToggle({
  on,
  onToggle,
  label,
  className,
  children,
}: {
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

export function Topbar({
  composer,
  editor,
  editMode,
  onToggleEdit,
  autoSpeak,
  onToggleAutoSpeak,
  menuOpen,
  onToggleMenu,
  keyboardOpen,
  onToggleKeyboard,
  resting,
  onToggleRest,
  onSavePhrase,
  onDeletePhrase,
  categories,
  countFor,
  onCreateCategory,
  onSpeak,
  onCopy,
  onPasted,
  listener,
}: {
  composer: Composer
  /** The phrase being written, which in edit mode is what the box holds. */
  editor: Editor
  editMode: boolean
  onToggleEdit: () => void
  autoSpeak: boolean
  onToggleAutoSpeak: () => void
  menuOpen: boolean
  onToggleMenu: () => void
  /** Peri's own keyboard, for a device where nothing else can type. */
  keyboardOpen: boolean
  onToggleKeyboard: () => void
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
  /** Listen mode: the microphone, and the box above the message — see `use-listen.ts`. */
  listener: Listener
}) {
  const { settings, update } = useSettings()
  const wide = useWideScreen()

  // Written through the same two helpers the settings panel uses, so the pair
  // cannot drift about what choosing one does to the other — which matters more
  // here than anywhere, since this is the surface built for switching often.
  const onChooseLanguage = useCallback(
    (tag: string, voices: SpeechSynthesisVoice[]) => update(chooseLanguage(settings, tag, voices)),
    [settings, update],
  )
  const onChooseVoice = useCallback(
    (voiceURI: string) => update(chooseVoice(settings, voiceURI)),
    [settings, update],
  )
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
   * The box the question lands in. Made here rather than in `HeardBox`, because
   * the two boxes are held to one height and this bar is the only thing that can
   * measure both.
   */
  const heardRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Both boxes grow with what is in them, up to a few lines — **and to the same
   * height as each other**, whichever is holding more deciding it.
   *
   * The message box was one line, fixed, with the overflow scrolled and the
   * scrollbar hidden — so a message longer than the box went above the fold and
   * stayed there. Every other surface in this app has dwell controls for
   * scrolling; these two have none, and nothing to hang them on, so what scrolls
   * out of one is gone as far as a gaze user is concerned.
   *
   * **One height for the pair**, because on a wide screen they stand side by
   * side: two boxes of somebody's speech at different heights read as two
   * unrelated things rather than as the two halves of one exchange, and the
   * question is not a caption on the answer.
   *
   * Measured rather than counted: a line is however many characters fit at this
   * text size and this width, which is not a number this can know. The cap is in
   * the stylesheet, where one `max-height` clamps both — so the pair cannot eat
   * the board however long either of them gets.
   *
   * **Where nothing can be measured, nothing is set.** `scrollHeight` is 0 in
   * jsdom, and a box set to nought is a box nobody can see; the same fallback
   * the grid's windowing makes, for the same reason.
   */
  const value = editMode ? draft.text : text
  const question = listener.open ? listener.heard.said : ''

  /**
   * A reply is out, and the box it is coming to says so.
   *
   * **In the message box rather than in the corner**, unlike everything else
   * this app waits on: a question is now answered without being asked to be, so
   * the seconds between somebody being spoken to and words appearing are seconds
   * in which nothing at all has happened as far as they can tell. The indicator
   * stands where the first line of the reply will be, so what it says is *the
   * words are coming here* rather than *the app is busy*.
   *
   * Only the reply. A translation goes under the question and has its own box to
   * appear in; this is the one that lands somewhere else.
   *
   * It waits the same quarter-second every other indicator here waits — see
   * `BusyIndicator`. Nothing is quick enough for that to matter often, but a
   * key the service will not accept comes back in one round trip, and a spinner
   * that appears and goes is worse on this screen than anywhere: the pointer is
   * somebody's gaze, and a thing that moves in the corner of an eye aims it. */
  const waiting = useSettled(listener.heard.asking === 'reply')
  useEffect(() => {
    const fit = () => {
      const boxes = [textareaRef.current, heardRef.current].filter(el => el !== null)
      if (boxes.length === 0) return
      // Back to one line first, and **both of them before either is measured**:
      // `scrollHeight` includes whatever height a box is already holding, so one
      // still standing at the other's height would report it straight back and
      // the pair would only ever grow.
      for (const el of boxes) el.style.height = ''
      const tallest = Math.max(...boxes.map(el => el.scrollHeight))
      if (!tallest) return
      for (const el of boxes) el.style.height = `${tallest}px`
    }
    fit()
    // The width decides where the lines break, and the width changes with the
    // window — a phone turned on its side rewraps every line in both boxes.
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [value, question, listener.open, textareaRef, settings.zoom])

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

      {/* Beside the menu because it is the same kind of thing: a surface the
          whole app shares, rather than anything about the message in the box.
          It stays put in both modes — on a device that cannot type without it,
          a control that moved would be the worst one to have to hunt for. */}
      <ActionButton
        label={keyboardOpen ? 'Hide the keyboard' : 'Show the keyboard'}
        onSelect={onToggleKeyboard}
        className={cx('keyboard-btn', keyboardOpen && 'is-on')}
      >
        <KeyboardIcon />
      </ActionButton>

      {/* The box and whatever rides its border. A wrapper only so the strip
          below can be positioned against **the box**: everything else on this
          bar is centred on the bar itself, which is 4px off the box's true
          centre and nobody can see — but a corner found that way would be out
          by the whole width of the action rail. */}
      <div className="text-display-wrap">
        {/* What was heard, beside the message rather than in it — or above it
            on a screen with no width to spare, which is the stylesheet's call
            and not this file's. Two boxes either way, and one of them is
            somebody else's words: mixing them would make the question and the
            answer one thing to be untangled by whoever is waiting for a reply.

            It goes *before* the message in the markup, so the question reads
            first in both arrangements and in a screen reader. What keeps the
            two strips on the border from moving with it is that both hang off
            the wrapper rather than off either box. */}
        {listener.open && <HeardBox listener={listener} fieldRef={heardRef} />}

        {/* The message box and what rides *its* borders, which after the split
            above is not the same thing as what rides the wrapper's. The mic and
            the two value controls stay on the wrapper, where they hold one point
            on screen whether listen mode is open or not; this one has to follow
            the box, because what it empties is the message. */}
        <div className="message-wrap">
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
            // Nothing while the reply is out: the waiting line stands exactly
            // where this does, and two greys in one place read as neither.
            placeholder={
              waiting
                ? ''
                : editMode
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

          {/* Never a target: `pointer-events: none`, like every other indicator
              here. A dwell user has no way to dismiss something that catches
              one, so nothing that merely reports may also answer. */}
          <div className="message-busy" role="status" aria-live="polite">
            {waiting && (
              <p className="message-busy-line">
                <span className="busy-spinner" aria-hidden="true" />
                Thinking of a reply…
              </p>
            )}
          </div>

          {/* The slot that empties the box, at the **left end of its lower
              border** — of the message, or in edit mode of the phrase being
              written along with whatever it was pointed at.

              It was a full-size button in the rail, and moving it onto the
              border is the bargain the mode strip already struck on the upper
              one: the board gets the width back, and what it costs is a smaller
              painted control overlapping the box, with an invisible area around
              it a tracker can still hit. It keeps its place across both modes,
              which is what makes the mode a change of meaning rather than a
              change of layout.

              The lower border rather than the upper because the upper one is
              full: a mode in the middle, the values at the right, the microphone
              at the left. Down here it shares the line with the edit strip,
              which is centred, and has the left end to itself. */}
          <div className="topbar-clear">
            {editMode ? (
              <ActionButton
                className="on-border"
                onSelect={() => startNew()}
                label="Start a new phrase"
                disabled={isUntouched}
              >
                <PlusIcon />
              </ActionButton>
            ) : (
              <ActionButton
                className="on-border"
                onSelect={clearOrUndo}
                label={showUndo ? 'Undo' : 'Clear'}
                disabled={!canClear}
              >
                {showUndo ? <UndoIcon /> : <ClearIcon />}
              </ActionButton>
            )}
          </div>
        </div>

        {/* Listen mode, at the box's upper-**left** corner, riding the same
            border the modes ride at its middle and the two values ride at the
            right. The three corners of that border are now all spoken for, and
            each holds a different kind of thing: a mode in the middle, a value
            at the right, and at the left the one control that opens a surface
            of its own.

            **Not drawn at all where the browser cannot listen.** A button that
            does nothing is worse than no button anywhere, and on a board aimed
            at by gaze it is a target spent for nothing. */}
        {listener.available && (
          <div className="topbar-listen">
            <ModeToggle
              className="listen-toggle"
              on={listener.open}
              onToggle={listener.toggle}
              label={listener.open ? 'Stop listening' : 'Listen to a question'}
            >
              <MicIcon />
            </ModeToggle>
          </div>
        )}

        {/* The language and the voice, at the box's upper-right corner, riding
            the same border the modes ride at its middle.

            **Their faces are the values**: the tag itself, `en-US`, and the
            voice's bare name. Six rem each — enough for "Samantha" and for any
            tag there is, and past that an ellipsis, with the whole of it on the
            control for a screen reader. Two words is what fits on a border; the
            settings panel is where the full names are.

            Its own strip, not the modes'. That one holds exactly three, found
            by position without being read, and `tests/app/App.test.tsx` asserts
            it — nothing may be inserted. These are a different kind of thing
            anyway: a mode is on or off, and these are one value out of many.

            Not rendered at all on a narrow screen rather than hidden: each
            builds the device's voice list, which is real work to do for
            something never shown. */}
        {wide && (
          <div className="topbar-choices">
            <LanguagePicker value={settings.language} onChange={onChooseLanguage}>
              {({ label, open, isOpen }) => (
                <ChoiceButton label={`Spoken language: ${label}. Choose another`} on={isOpen} onOpen={open}>
                  {settings.language || 'auto'}
                </ChoiceButton>
              )}
            </LanguagePicker>

            <VoicePicker value={settings.voiceURI} onChange={onChooseVoice} defaultLabel="Default">
              {({ label, name, open, isOpen }) => (
                <ChoiceButton label={`Voice: ${label}. Choose another`} on={isOpen} onOpen={open}>
                  {name}
                </ChoiceButton>
              )}
            </VoicePicker>
          </div>
        )}
      </div>

      {/* Three on the right in both modes, in the same three places. Outside
          edit mode they are how a message leaves; inside it they are what
          becomes of the phrase in the box. Paste is the one that means the same
          thing either way, so it keeps its place at the end. */}
      {editMode ? (
        <>
          <ActionButton
            className="right"
            onSelect={onSavePhrase}
            label={draft.kept ? `Keep this ${draft.kept} as a phrase` : 'Save phrase'}
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
            label={draft.kept ? `Forget this ${draft.kept}` : 'Delete phrase'}
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

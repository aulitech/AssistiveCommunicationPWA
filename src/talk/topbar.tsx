// The bar across the top: the message being composed, and the controls that act
// on it — or, in edit mode, the phrase being written and the controls that act on
// *that*. **The box is a card**, the shape of a chat app's input box: a row
// along its top — the clipboard at the far left, the modes in the middle, the
// language and the voice at the right — and under it the line the words are
// written on, emptied from its left end and sent from right after the last word.
// See docs/decisions/the-message-card.md.
//
// **The box is the phrase editor in edit mode.** There was a dialog for that,
// which covered the very phrases being edited and had to be got out of before
// anything else could be reached. So the one box does both jobs and the rail
// in it changes with the mode: clear, copy, paste and speak become start a new
// phrase, paste, delete and save. The controls stay in the same places,
// which is what makes the mode a change of meaning rather than a change of
// layout.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compose, parseSegments } from '../core/phrases'
import { useSettings } from '../ui/settings'
import { chooseLanguage, chooseVoice } from '../core/store'
import { LanguagePicker } from '../voice/language-picker'
import { VoicePicker } from '../voice/picker'
import { useCaretDwell } from '../ui/caret'
import { AfterText } from '../ui/after-text'
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
  PasteIcon,
  PleaseIcon,
  PlusIcon,
  QuestionIcon,
  SpeakIcon,
  TrashIcon,
  UndoIcon,
} from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { useScrollEdges } from '../ui/scroll-edges'
import { useMediaQuery } from '../ui/media'
import { BoxScroll } from '../ui/controls'
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
 * A mode toggle — auto-speak, edit, or the microphone. Edit and auto-speak sit
 * either side of Rest in the card's row, because all three are modes. The area
 * answering to a pointer is a little larger than the painted one, and invisible
 * — see `.mode-btn::before`.
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

/**
 * One of the two value controls in the card's row, before the actions.
 *
 * A face that says the value rather than a glyph that says the subject: `en-US`
 * and `Samantha` tell somebody what the board will do, where a globe and a
 * waveform only say which grid opens. Six rem is what the row can spare, and
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
  undoDelete,
  removingFrom,
  categories,
  countFor,
  onChooseCategories,
  onCreateCategory,
  onSpeak,
  onCopy,
  onPasted,
  listener,
  onToggleListen,
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
  /**
   * The phrase just deleted, while it can still be put back — see
   * `lastDeleted` in `talk.tsx`. It takes the slot that starts a new phrase,
   * which has nothing to do at that moment: the bin has just left the draft
   * blank.
   */
  undoDelete: { words: string; undo: () => void } | null
  /** The category the bin takes the phrase out of, where it only does that — see `talk.tsx`. */
  removingFrom: string | null
  /** For the row in the card that says what is being edited: what a phrase can be filed under. */
  categories: string[]
  countFor: (name: string) => number
  /** Done on the category grid — which, for a phrase on the board, files it there and then. */
  onChooseCategories: (names: string[]) => void
  onCreateCategory: () => void
  /** Both of these are how a message leaves, which the screen keeps a record of. */
  onSpeak: () => void
  onCopy: () => void
  /** Says what came of asking, so the screen can report a refusal out loud. */
  onPasted: (result: PasteResult) => void
  /** Listen mode: the microphone, and the box above the message — see `use-listen.ts`. */
  listener: Listener
  /**
   * The microphone control, which is `listener.toggle` with the board's mode
   * hung on it — opening it puts the board in auto-speak, and that decision
   * belongs beside `setMode` in `talk.tsx` rather than here.
   */
  onToggleListen: () => void
}) {
  const { settings, update } = useSettings()
  const wide = useMediaQuery(WIDE_ENOUGH)

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
  const togglePlease = useCallback(() => update({ please: !settings.please }), [settings.please, update])
  const { text, setText, showUndo, canClear, clearOrUndo, textareaRef, trackCursor, setCursor } = composer
  const {
    draft,
    isUntouched,
    startNew,
    setText: setDraftText,
    trackCursor: trackDraftCursor,
    setCursor: setDraftCursor,
  } = editor

  /**
   * What the phrase *reads* as, for the voice picker's sample.
   *
   * Not what it is written as: choosing a voice speaks a sample the moment it is
   * chosen, and nobody wants to hear "open curly bracket, quote, red, quote"
   * read out — least of all charged to an account by the character.
   */
  const spokenDraft = useMemo(() => compose(parseSegments(draft.text)), [draft.text])

  // One box, two things in it: the message being composed, and — in edit mode —
  // the phrase being written. Which one is showing decides everything below,
  // because a keystroke has to go to the right one of the two.
  const write = editMode ? setDraftText : setText

  // The same dwell either way, and enabled in both modes now. The box used to be
  // `readOnly` in edit mode, a button whose hold opened the editor dialog; there
  // is no dialog to open any more, so it is a box being typed in whichever mode
  // it is in. The caret does a second job in both — it decides which word the
  // grid narrows itself to, which is how a gaze user says which word to finish —
  // so where it lands is reported back to whichever of the two the box holds.
  const track = editMode ? trackDraftCursor : trackCursor
  const caret = useCaretDwell(textareaRef, settings.actionDwellMs, {
    onPlace: editMode ? setDraftCursor : setCursor,
  })

  /**
   * The box the question lands in. Made here rather than in `HeardBox`, because
   * the two boxes are held to one height and this bar is the only thing that can
   * measure both.
   */
  const heardRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Whether either box has more in it than shows, for the arrows inside them.
   * Measured here, beside the heights, because a box at its cap grows *inside*
   * without growing outside, and nothing fires for that but the fit below.
   */
  const messageEdges = useScrollEdges(textareaRef)
  const heardEdges = useScrollEdges(heardRef, listener.open)
  const { update: remeasureMessage } = messageEdges
  const { update: remeasureHeard } = heardEdges

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
  /** Whether there is anything to send — Speak and Save are drawn only then. */
  const hasWords = value.trim() !== ''
  const question = listener.open ? listener.notice || listener.heard.said : ''

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
  useEffect(() => {
    const fit = () => {
      const boxes = [textareaRef.current, heardRef.current].filter(el => el !== null)
      if (boxes.length === 0) return
      // Back to one line first, and **both of them before either is measured**:
      // `scrollHeight` includes whatever height a box is already holding, so one
      // still standing at the other's height would report it straight back and
      // the pair would only ever grow.
      for (const el of boxes) el.style.height = ''
      // The copies `AfterText` lays out count too: a control that wrapped onto a
      // line of its own after the last word needs the box to hold that line.
      // Each given its box's width first: on a resize this runs before the copy
      // has been told the box is wider or narrower, and a copy measured at the
      // old width would size the box for lines it no longer has.
      const copies = boxes.flatMap(el => {
        const copy = el.parentElement?.querySelector<HTMLElement>(':scope > .after-text-mirror')
        if (!copy) return []
        copy.style.width = `${el.offsetWidth}px`
        return [copy]
      })
      const tallest = Math.max(...boxes.map(el => el.scrollHeight), ...copies.map(el => el.offsetHeight))
      // **Plus the box's own border.** The height is `border-box`, and
      // `scrollHeight` is the text and its padding without the border — so a box
      // set to exactly that was two pixels short of holding what was in it. That
      // is enough for the scroll arrows to appear on everything longer than a
      // line, and the room they take rewraps the text into a box that really
      // does overflow. The border is read while the height is still cleared.
      if (tallest) for (const el of boxes) el.style.height = `${tallest + el.offsetHeight - el.clientHeight}px`
      // Whatever the heights did, whether there is more than shows is a fresh
      // question — the cap is where a box stops growing and starts scrolling.
      remeasureMessage()
      remeasureHeard()
    }
    fit()
    // The width decides where the lines break, and the width changes with the
    // window — a phone turned on its side rewraps every line in both boxes.
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [value, question, listener.open, textareaRef, settings.zoom, remeasureMessage, remeasureHeard])

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
      {/* At the left, as the menu is at the right, because it is the same kind
          of thing: a surface the whole app shares, rather than anything about
          the message in the box. It stays put in both modes — on a device that cannot type without it,
          a control that moved would be the worst one to have to hunt for.

          **Only where it has been asked for.** It is the one way to type at all
          on iOS and a target in the way on a device with a real keyboard, so it
          is a setting rather than something every board carries. */}
      {settings.keyboard && (
        <ActionButton
          label={keyboardOpen ? 'Hide the keyboard' : 'Show the keyboard'}
          onSelect={onToggleKeyboard}
          className={cx('keyboard-btn', keyboardOpen && 'is-on')}
        >
          <KeyboardIcon />
        </ActionButton>
      )}

      {/* The two cards: the question, when listen mode is open, and the
          message. Side by side on a wide screen, stacked on a narrow one. */}
      <div className="text-display-wrap">
        {/* What was heard, beside the message rather than in it — or above it
            on a screen with no width to spare, which is the stylesheet's call
            and not this file's. Two boxes either way, and one of them is
            somebody else's words: mixing them would make the question and the
            answer one thing to be untangled by whoever is waiting for a reply.

            It goes *before* the message in the markup, so the question reads
            first in both arrangements and in a screen reader. Opening it moves
            the message card, which is why the microphone holds the dwells. */}
        {listener.open && <HeardBox listener={listener} fieldRef={heardRef} edges={heardEdges} />}

        {/* The message card: the words, the row of controls, and in edit mode
            what is being edited. */}
        <div className="message-wrap">
          {/* **The card's row of controls, above the line**: the clipboard at
              the far left, the modes in the middle — the microphone, edit, Rest,
              auto-speak — and the language and the voice at the right, with
              delete after them in edit mode, as far from Save as the card goes. */}
          <div className="message-tools">
            <div className="tools-clipboard">
              {/* Paste in both modes, meaning the same thing either way; copy only
                  outside edit mode, where the message is what there is to copy.
                  Paste is never disabled: what is on the clipboard is not this
                  app's to know until it asks — and the keyboard route into a text
                  box is Ctrl-V, which is exactly the input this app exists
                  without. */}
              {!editMode && (
                <ActionButton className="in-card" onSelect={onCopy} label="Copy to clipboard" disabled={!text}>
                  <CopyIcon />
                </ActionButton>
              )}
              <ActionButton className="in-card" onSelect={paste} label="Paste from clipboard">
                <PasteIcon />
              </ActionButton>
            </div>
            <div className="tools-modes">
              {listener.available && (
                <div className="topbar-listen">
                  <ModeToggle
                    className="listen-toggle"
                    on={listener.open}
                    onToggle={onToggleListen}
                    label={listener.open ? 'Stop listening' : 'Listen to a question'}
                  >
                    <QuestionIcon />
                  </ModeToggle>
                </div>
              )}
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

                {/* **Please on the end of everything said**, in the language it
                    is said in, and never written into the phrase — see
                    `core/please.ts`. After auto-speak, being about how what is
                    said comes out, and lit while it is on as the modes are. */}
                <ModeToggle
                  className="please-toggle"
                  on={settings.please}
                  onToggle={togglePlease}
                  label={settings.please ? 'Stop saying please' : 'Say please at the end of everything spoken'}
                >
                  <PleaseIcon />
                </ModeToggle>
              </div>
            </div>
            <div className="tools-values">
              {(wide || editMode) && (
                <div className="topbar-choices">
                  <LanguagePicker value={settings.language} onChange={onChooseLanguage}>
                    {({ label, open, isOpen }) => (
                      <ChoiceButton
                        label={
                          editMode
                            ? `Language this phrase's voice is for: ${label}. Choose another`
                            : `Spoken language: ${label}. Choose another`
                        }
                        on={isOpen}
                        onOpen={open}
                      >
                        {settings.language || 'auto'}
                      </ChoiceButton>
                    )}
                  </LanguagePicker>

                  {editMode ? (
                    <VoicePicker
                      value={draft.voice}
                      onChange={editor.setVoice}
                      defaultLabel="Same as everything else"
                      sampleText={spokenDraft}
                    >
                      {({ label, name, open, isOpen }) => (
                        <ChoiceButton
                          label={`Voice for this phrase: ${label}. Choose another`}
                          on={isOpen}
                          onOpen={open}
                        >
                          {name}
                        </ChoiceButton>
                      )}
                    </VoicePicker>
                  ) : (
                    <VoicePicker value={settings.voiceURI} onChange={onChooseVoice} defaultLabel="Default">
                      {({ label, name, open, isOpen }) => (
                        <ChoiceButton label={`Voice: ${label}. Choose another`} on={isOpen} onOpen={open}>
                          {name}
                        </ChoiceButton>
                      )}
                    </VoicePicker>
                  )}
                </div>
              )}
              {editMode && (
                <ActionButton
                  // **Not shown until there is something to delete** — a phrase
                  // on the board, rather than a new one being written. Hidden
                  // rather than taken away, so its place is kept and the
                  // language and the voice beside it never slide under a
                  // resting pointer as it comes and goes.
                  className={cx('in-card danger', draft.isNew && 'is-absent')}
                  onSelect={onDeletePhrase}
                  label={
                    draft.kept
                      ? `Forget this ${draft.kept}`
                      : removingFrom
                        ? `Take out of ${removingFrom}`
                        : 'Delete phrase'
                  }
                  disabled={draft.isNew}
                >
                  <TrashIcon />
                </ActionButton>
              )}
            </div>
          </div>

          {/* **The line the words are written on**: the slot that empties the box
              at its left end, then the words, with Speak — or Save in edit
              mode — right after the last of them. */}
          <div className="message-line">
            <div className="topbar-clear">
              {editMode && undoDelete ? (
                // The undo glyph the composer's own slot draws, because it means
                // the same thing: put back the last thing I did.
                <ActionButton
                  className="in-card"
                  onSelect={undoDelete.undo}
                  label={`Undo deleting “${undoDelete.words}”`}
                >
                  <UndoIcon />
                </ActionButton>
              ) : editMode ? (
                <ActionButton
                  className="in-card"
                  onSelect={() => startNew()}
                  label="Start a new phrase"
                  disabled={isUntouched}
                >
                  <PlusIcon />
                </ActionButton>
              ) : (
                <ActionButton
                  className="in-card"
                  onSelect={clearOrUndo}
                  label={showUndo ? 'Undo' : 'Clear'}
                  disabled={!canClear}
                >
                  {showUndo ? <UndoIcon /> : <ClearIcon />}
                </ActionButton>
              )}
            </div>
            <div className="message-field">
              <textarea
                ref={textareaRef}
                className={cx(
                  'text-display',
                  caret.active && 'dwelling',
                  (messageEdges.canUp || messageEdges.canDown) && 'has-scroll',
                )}
                style={dwellVar(settings.actionDwellMs)}
                aria-label={editMode ? 'Phrase text' : 'Composed message'}
                value={value}
                onChange={e => {
                  write(e.target.value)
                  track(e)
                }}
                // The composer's caret or the editor's, whichever the box holds: it
                // decides which word the grid narrows to.
                onSelect={track}
                onPaste={linkInput.onPaste}
                onDrop={linkInput.onDrop}
                onDragOver={linkInput.onDragOver}
                {...caret.props}
                onClick={track}
                onKeyUp={track}
                placeholder={
                  editMode
                    ? 'Write a phrase, or hold one on the board to edit it…'
                    : settings.autoSpeak
                      ? 'Immediately speak selected phrase'
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

              <BoxScroll edges={messageEdges} what="message" />
              {/* **Speak right after the last word**, as if it were the next one —
                  Save in edit mode — and only once there are words: see
                  `AfterText`, which finds where the words end and holds the
                  dwells if it lands under a resting pointer. */}
              <AfterText
                fieldRef={textareaRef}
                value={value}

                className="topbar-actions"
              >
                {hasWords &&
                  (editMode ? (
                    <ActionButton
                      className="in-card is-primary"
                      onSelect={onSavePhrase}
                      label={draft.kept ? `Keep this ${draft.kept} as a phrase` : 'Save phrase'}
                      disabled={!draft.canSave}
                    >
                      <CheckIcon />
                    </ActionButton>
                  ) : (
                    <ActionButton className="in-card is-primary" onSelect={onSpeak} label="Speak" disabled={!text}>
                      <SpeakIcon />
                    </ActionButton>
                  ))}
              </AfterText>
            </div>
          </div>

          {/* What is being edited and where it is filed, in a row of the card's
              own **below** the controls — so turning edit mode on grows the card
              downwards and moves nothing under the pointer that turned it on. */}
          {editMode && (
            <PhraseEditBar
              draft={draft}
              categories={categories}
              countFor={countFor}
              onCategory={onChooseCategories}
              onCreateCategory={onCreateCategory}
            />
          )}
        </div>
      </div>

      {/* **The menu, in the upper right corner**, where an app's menu is
          looked for. Back sits in the same corner of every panel it opens, and
          holds the dwells as it closes one — see `PanelBack` — so the pointer
          left over it does not open the menu again. */}
      <ActionButton label={menuOpen ? 'Close menu' : 'Open menu'} onSelect={onToggleMenu} className="menu-btn">
        <MenuIcon />
      </ActionButton>
    </header>
  )
}

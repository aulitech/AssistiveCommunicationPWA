// The box beside the message, or above it: what was just asked.
//
// It is a second text area and deliberately not a second message. The question
// is somebody else's words and the answer is the user's, and a board that mixed
// the two would leave whoever is waiting for a reply to untangle them.
//
// **Which of the two arrangements is a question about the screen, not about the
// box**, and it is settled in the stylesheet rather than here — `.heard-wrap`
// takes a line of its own until there is width to put it beside the message, at
// which point the two share one: 35% question, 65% message. What that buys is
// the board's height, since stacked this pushes the grid down by the whole of
// the box and the tools under it. Nothing in this file knows which it is.
//
// **It is a text box, so it answers to a dwell like the other one.** A recogniser
// mis-hears names, and the one thing a gaze user could never do about that was
// put a caret in the middle of a sentence — so the same `useCaretDwell` that
// made the message box reachable makes this one correctable.
//
// Its controls ride the lower border rather than sitting in a row beneath it, so
// the box costs the board the height of a box and not the height of a box and a
// toolbar. There is no button for the microphone: clearing the box starts it and
// undo stops it, because emptying this box has one reason behind it — what came
// back was wrong — and what somebody wants next is to be listened to again.
// The third is the one that reaches anywhere else in the app: it fills the board
// with answers to choose between, and the one chosen goes into the message box
// through the composer's own undo — see `listen/suggest.ts` for why that matters
// more here than anywhere.

import { useCallback, type RefObject } from 'react'
import { useSettings } from '../ui/settings'
import { useCaretDwell } from '../ui/caret'
import { useDwellControl } from '../ui/dwell'
import { cx, dwellVar } from '../ui/style'
import { BoxScroll } from '../ui/controls'
import type { ScrollEdges } from '../ui/scroll-edges'
import { ClearIcon, MicIcon, SuggestIcon, TranslateIcon, UndoIcon } from '../ui/icons'
import type { Listener } from './use-listen'

function HeardButton({
  onSelect,
  label,
  disabled,
  children,
}: {
  onSelect: () => void
  label: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onSelect, { disabled })
  return (
    <button
      type="button"
      className={cx('heard-btn', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      aria-label={label}
      {...props}
    >
      {children}
      <span className="dwell-bar" key={active ? 'a' : 'i'} />
    </button>
  )
}

export function HeardBox({
  listener,
  fieldRef,
  edges,
}: {
  listener: Listener
  /**
   * The box itself, held by the topbar rather than made here.
   *
   * **The two boxes are one height**, and whichever holds more decides it — so
   * something has to be able to measure both, and the only thing that can see
   * both is the bar they are in.
   */
  fieldRef: RefObject<HTMLTextAreaElement | null>
  /** Whether the box has more in it than shows — measured by the bar, beside the height. */
  edges: ScrollEdges
}) {
  const { settings } = useSettings()
  const {
    heard,
    correct,
    translate,
    suggest,
    clearOrUndo,
    showUndo,
    canClear,
    canTranslate,
    canSuggest,
    messageEmpty,
  } = listener

  const write = useCallback((value: string) => correct(value), [correct])

  /**
   * No `onPlace`, unlike the message box. The caret that hook reports is the
   * composer's, and it decides which word the grid narrows itself to — a caret
   * moved about in somebody else's question must not narrow the board to a word
   * nobody is composing.
   *
   * `selectOnHold` is on, for the reason the Aliases panel's fields have it:
   * this box is opened in order to *correct* something, so a rest on it is
   * intent rather than somebody parking their gaze while they read.
   */
  const caret = useCaretDwell(fieldRef, settings.actionDwellMs, { selectOnHold: true })

  const nothingHeard = heard.said.trim() === ''

  return (
    <div className="heard-wrap">
      {/* The box and the arrows that scroll it, together: the arrows sit inside
          the box's right edge and have to be positioned against the box rather
          than against everything under it. */}
      <div className="heard-field">
        <textarea
          ref={fieldRef}
          className={cx(
            'heard-text',
            caret.active && 'dwelling',
            heard.listening && 'is-listening',
            (edges.canUp || edges.canDown) && 'has-scroll',
          )}
          style={dwellVar(settings.actionDwellMs)}
          aria-label="Question heard"
          value={heard.said}
          onChange={e => write(e.target.value)}
          placeholder={heard.listening ? 'Speak or type a question' : 'Nothing heard yet'}
          rows={1}
          spellCheck
          {...caret.props}
        />
        <BoxScroll edges={edges} what="question" />
      </div>

      {/* The three controls, riding the box's lower border rather than sitting
          in a row under it — the bargain every strip on the message box strikes,
          and worth more here than anywhere: this box is the one thing between
          the question and the board somebody answers it from.

          Each carries its own black ground, because a control painted on a
          border with nothing behind it shows the border and the words through
          the gaps — the reason `.topbar-modes` has one. A ground each rather
          than one pill around all three, since the two rem between them is a
          target-separation number and a pill that wide would not fit the
          narrower pane the wide-screen split gives this box. */}
      <div className="heard-tools">
        {/* First, and the same two glyphs the message box empties itself with.
            One box is what somebody is being asked and the other is what they
            are about to say, and a control that means *empty this* has to look
            the same on both or it is two controls to learn. A recogniser
            mis-hears, and the answer to a question that came out as nonsense is
            to empty the box — which makes this the gesture most worth being able
            to take back, since what it threw away is the only copy of what was
            said to somebody. */}
        <HeardButton
          onSelect={clearOrUndo}
          label={showUndo ? 'Undo. Put the question back and stop listening' : 'Clear, and listen again'}
          disabled={!canClear}
        >
          {showUndo ? <UndoIcon /> : <ClearIcon />}
        </HeardButton>

        {canTranslate && (
          <HeardButton
            onSelect={() => void translate()}
            label="Read this in your own language"
            disabled={nothingHeard || heard.asking !== ''}
          >
            <TranslateIcon />
          </HeardButton>
        )}

        {canSuggest && (
          <HeardButton
            onSelect={() => void suggest()}
            // Named for where they go. They land on the board to be chosen
            // between, and nothing here ever speaks one — and a control that has
            // gone quiet explains nothing by itself, so the one thing it can
            // still do is say what would let it work.
            label={
              messageEmpty
                ? 'Suggest answers, onto the board'
                : 'Suggest answers. Clear the message first — a message half written is how you say you are already answering'
            }
            disabled={nothingHeard || heard.asking !== '' || !messageEmpty}
          >
            <SuggestIcon />
          </HeardButton>
        )}

        {/* **The microphone is live**, lit in the corner the tools leave free,
            and drawn at no other time — so there is nothing to read it as but
            *this is being heard now*. The box's own border turns solid as well,
            but a border is easy to miss from across a room, and it is the
            person being listened to who most needs to know.

            Not a control: there is nothing to do to it that the controls beside
            it do not already do, and a target that did nothing would be a dwell
            spent for nothing. It pulses — brightness and glow, the way the
            resting lozenge does, and still under reduced motion. In this row
            rather than positioned over the corner, so a
            box too narrow for all four pushes it along rather than laying it
            over a control. */}
        {heard.listening && (
          <span className="heard-live" role="img" aria-label="The microphone is on">
            <MicIcon />
          </span>
        )}
      </div>

      {/* What it says in the board's own language, under the words that were
          said — the shape the Translations tab uses, and for the same reason:
          the person reading this cannot necessarily read the line above it. */}
      {heard.meaning && <p className="heard-meaning">{heard.meaning}</p>}

      {/* A failure says what it was and nothing happens. A refused microphone
          is the one worth naming exactly, since nothing in the app can fix it
          and the browser is where it has to be allowed. */}
      {heard.error && (
        <p className="heard-error" role="alert">
          {heard.error}
        </p>
      )}
    </div>
  )
}

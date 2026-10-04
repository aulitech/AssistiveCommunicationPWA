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
// It is a card like the message box, its controls on the line its words are on
// — see docs/decisions/the-message-card.md. There is no button for the
// microphone: clearing the box starts it and
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
import { AfterText } from '../ui/after-text'
import type { ScrollEdges } from '../ui/scroll-edges'
import { ClearIcon, MicIcon, SuggestIcon, UndoIcon } from '../ui/icons'
import type { Listener } from './use-listen'

function HeardButton({
  onSelect,
  label,
  disabled,
  primary,
  children,
}: {
  onSelect: () => void
  label: string
  disabled?: boolean
  /** Filled in the accent, as Speak is — the one thing this card is for. */
  primary?: boolean
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onSelect, { disabled })
  return (
    <button
      type="button"
      className={cx('heard-btn', primary && 'is-primary', active && 'dwelling')}
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
  const { heard, correct, suggest, clearOrUndo, showUndo, canClear, canSuggest, messageEmpty, notice } = listener

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
  const caret = useCaretDwell(fieldRef, settings.actionDwellMs, { selectOnHold: true, disabled: notice !== '' })

  const nothingHeard = heard.said.trim() === ''

  return (
    <div className="heard-wrap">
      {/* **The line the question is written on**, as the message's is: the slot
          that empties it at its left end, the words, and at its right end Ask —
          suggest answers — **drawn only once there is a question to ask about**,
          in a place kept for it either way so nothing moves when it arrives. */}
      <div className="heard-line">
        <div className="heard-start">
          <HeardButton
            onSelect={clearOrUndo}
            label={showUndo ? 'Undo. Put the question back and stop listening' : 'Clear, and listen again'}
            disabled={!canClear}
          >
            {showUndo ? <UndoIcon /> : <ClearIcon />}
          </HeardButton>
        </div>
        <div className="heard-field">
          <textarea
            ref={fieldRef}
            className={cx(
              'heard-text',
              caret.active && 'dwelling',
              heard.listening && 'is-listening',
              notice && 'is-notice',
              (edges.canUp || edges.canDown) && 'has-scroll',
            )}
            style={dwellVar(settings.actionDwellMs)}
            aria-label="Question heard"
            // **Without a key it can use, the box says so and takes nothing.** As
            // its words rather than as a placeholder, so it is measured like a
            // question and the box grows to hold all of it; read-only, so neither
            // a keyboard nor Peri's own can put a question in it.
            value={notice || heard.said}
            readOnly={notice !== ''}
            onChange={e => write(e.target.value)}
            placeholder={heard.listening ? 'Speak or type a question' : 'Nothing heard yet'}
            rows={1}
            spellCheck
            {...caret.props}
          />
          <BoxScroll edges={edges} what="question" />
          {/* **Ask right after the last word of the question**, once there is
              one — see `AfterText`, as Speak stands after the message. */}
          <AfterText fieldRef={fieldRef} value={notice || heard.said} className="heard-ask">
            {canSuggest && !nothingHeard && !notice && (
              <HeardButton
                primary
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
                disabled={nothingHeard || heard.asking || !messageEmpty}
              >
                <SuggestIcon />
              </HeardButton>
            )}
          </AfterText>
        </div>
        <div className="heard-end">
          {/* **The microphone is live**, at the right end of the question's line, and
              drawn only while sound is actually coming in — after the browser has
              been given the microphone, not when it was asked for it — so there
              is nothing to read it as but *this is being heard now*.

              Its capsule fills and empties like a level meter, which is the whole
              of the animation: nothing outside the glyph moves, and its ground
              stays put, so nothing around it glows. Still under reduced motion.

              Not a control: there is nothing to do to it that the controls beside
              it do not already do, and a target that did nothing would be a dwell
              spent for nothing. */}
          {heard.hearing && (
            <span className="heard-live" role="img" aria-label="The microphone is on">
              <MicIcon live />
            </span>
          )}
        </div>
      </div>

      {/* What it says in the board's own language, under the words that were
          said — the shape the Translations tab uses, and for the same reason:
          the person reading this cannot necessarily read the line above it. */}

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

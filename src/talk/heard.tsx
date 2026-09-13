// The box above the message: what was just asked.
//
// It is a second text area and deliberately not a second message. The question
// is somebody else's words and the answer is the user's, and a board that mixed
// the two would leave whoever is waiting for a reply to untangle them.
//
// **It is a text box, so it answers to a dwell like the other one.** A recogniser
// mis-hears names, and the one thing a gaze user could never do about that was
// put a caret in the middle of a sentence — so the same `useCaretDwell` that
// made the message box reachable makes this one correctable.
//
// Three controls sit under it, and each is offered only where there is something
// behind it: listen again, read it in your own language, and suggest a reply.
// The third is the one that writes anywhere else in the app, and what it writes
// goes into the message box through the composer's own undo — see
// `listen/suggest.ts` for why that matters more here than anywhere.

import { useCallback, useRef } from 'react'
import { useSettings } from '../ui/settings'
import { useCaretDwell } from '../ui/caret'
import { useDwellControl } from '../ui/dwell'
import { cx, dwellVar } from '../ui/style'
import { MicIcon, SuggestIcon, TranslateIcon } from '../ui/icons'
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
  messageEmpty,
}: {
  listener: Listener
  /**
   * Whether the message box has room for a suggestion.
   *
   * **A suggestion never writes over words somebody already had.** The box's
   * undo is a one-step toggle rather than a stack, so a suggestion that replaced
   * a half-written message could not be walked back past it — which would make
   * accepting a machine's words a thing that happened to somebody rather than a
   * thing they chose. The control goes quiet instead, and says why.
   */
  messageEmpty: boolean
}) {
  const { settings } = useSettings()
  const { heard, correct, again, translate, suggest, canTranslate, canSuggest } = listener

  const write = useCallback((value: string) => correct(value), [correct])

  const fieldRef = useRef<HTMLTextAreaElement>(null)
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
      <textarea
        ref={fieldRef}
        className={cx('heard-text', caret.active && 'dwelling', heard.listening && 'is-listening')}
        style={dwellVar(settings.actionDwellMs)}
        aria-label="Question heard"
        value={heard.said}
        onChange={e => write(e.target.value)}
        placeholder={heard.listening ? 'Listening…' : 'Nothing heard yet'}
        rows={1}
        spellCheck
        {...caret.props}
      />

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

      <div className="heard-tools">
        <HeardButton onSelect={again} label={heard.listening ? 'Listening. Dwell to start again' : 'Listen again'}>
          <MicIcon />
        </HeardButton>

        {canTranslate && (
          <HeardButton
            onSelect={() => void translate()}
            label="Read this in your own language"
            disabled={nothingHeard || heard.working}
          >
            <TranslateIcon />
          </HeardButton>
        )}

        {canSuggest && (
          <HeardButton
            onSelect={() => void suggest()}
            // Named as an offer rather than an answer. It goes into the message
            // box to be read and changed, and nothing here ever speaks it — and
            // a control that has gone quiet explains nothing by itself, so the
            // one thing it can still do is say what would let it work.
            label={
              messageEmpty
                ? 'Suggest a reply, into the message box'
                : 'Suggest a reply. Clear the message first — a suggestion never writes over your own words'
            }
            disabled={nothingHeard || heard.working || !messageEmpty}
          >
            <SuggestIcon />
          </HeardButton>
        )}
      </div>
    </div>
  )
}

// Listen mode: the other half of the conversation.
//
// Peri has always been one-directional. Somebody chooses phrases and the board
// says them; the person they are talking to speaks into the room and leaves no
// trace of it anywhere. Listen mode writes that half down — the question is
// heard, shown in a box of its own above the message, and can then be corrected,
// read in the user's own language, and answered.
//
// **Three services, and each one failing costs only itself.** The microphone is
// the browser's; the translation is the one already behind every phrase the
// board speaks; the suggested reply is the user's own Anthropic key. A refused
// microphone leaves an empty box. A failed translation leaves the words as they
// were heard. A failed suggestion leaves the message box exactly as it was.
// None of the three can stop somebody saying something.
//
// **A suggestion is never spoken.** It goes into the message box through the
// composer's own history, so one dwell on Undo puts back whatever was there —
// and it is said only when the person dwells on Speak, like any other message.
// See `listen/suggest.ts` for the whole of that argument.

import { useCallback, useEffect, useRef, useState } from 'react'
import { canListen, listen } from '../listen/recognition'
import { suggestReply } from '../listen/suggest'
import { hasTranslateKey, translateHeard } from '../translate/client'
import { addReplyTurn, loadReplyContext, saveReplyContext } from '../core/store'

/** What the box above the message is holding, and what is happening to it. */
export interface Heard {
  /** The words as they were said, in whatever language they were said in. */
  said: string
  /** What they say in the board's own language, once that is known. */
  meaning: string
  /** Whether the microphone is open right now. */
  listening: boolean
  /** Whether a translation or a suggestion is still out. */
  working: boolean
  /** The last thing that went wrong, for the line under the box. */
  error: string
}

const EMPTY: Heard = { said: '', meaning: '', listening: false, working: false, error: '' }

export function useListen({
  language,
  replyKey,
  replyModel,
  onSuggest,
}: {
  /** What the board is spoken as, which is also what the microphone listens for. */
  language: string
  /**
   * The key behind a suggested reply, passed in rather than read here so that
   * setting one up in Settings takes effect without a reload — the screen above
   * already holds it, because synchronizing sends it.
   */
  replyKey: string
  /** Which model writes the reply — see `REPLY_MODELS`. */
  replyModel: string
  /** Where a suggested reply goes. Never spoken — see above. */
  onSuggest: (text: string, blankAt: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [heard, setHeard] = useState<Heard>(EMPTY)

  /** The way to stop whatever is listening now, or null when nothing is. */
  const stopRef = useRef<(() => void) | null>(null)
  /**
   * Bumped by anything that makes an answer stale — closing the box, listening
   * again, asking again. An answer that comes back for a question the user has
   * moved on from is dropped rather than written over what replaced it.
   */
  const askedRef = useRef(0)
  /**
   * Read through a ref so a suggestion arriving after several renders goes to
   * the composer as it is now, not as it was when the request went out. Written
   * in an effect rather than during the render, which is a rule React enforces
   * here.
   */
  const onSuggestRef = useRef(onSuggest)
  useEffect(() => {
    onSuggestRef.current = onSuggest
  }, [onSuggest])

  const stopListening = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
  }, [])

  // Nothing may be left listening once this screen is gone. A microphone held
  // open by a component nobody can see is the worst version of this feature.
  useEffect(() => stopListening, [stopListening])

  const startListening = useCallback(() => {
    askedRef.current++
    stopListening()
    setHeard({ ...EMPTY, listening: true })

    const mine = askedRef.current
    stopRef.current = listen(language, {
      onHeard: said => {
        if (mine !== askedRef.current) return
        // Interim results, so the box fills as the words arrive: a box that
        // stays empty for four seconds and then fills is indistinguishable from
        // a box that is broken.
        setHeard(h => ({ ...h, said }))
      },
      onDone: error => {
        if (mine !== askedRef.current) return
        stopRef.current = null
        setHeard(h => ({ ...h, listening: false, error: error ?? '' }))
      },
    })
  }, [language, stopListening])

  /** Opens the box and starts listening, or closes it and stops. */
  const toggle = useCallback(() => {
    if (open) {
      askedRef.current++
      stopListening()
      setOpen(false)
      // **Dropped at the moment it is closed**, rather than left to be replaced
      // the next time the box is opened. Nothing on screen can tell the two
      // apart and no test here can either — what differs is whether somebody's
      // question is still held in memory after they have put it away, and it is
      // the sort of question this app should not need asking twice.
      setHeard(EMPTY)
      return
    }
    setOpen(true)
    startListening()
  }, [open, startListening, stopListening])

  /** Corrections, typed or dwelled into the box. The meaning goes stale with them. */
  const correct = useCallback((said: string) => {
    askedRef.current++
    setHeard(h => ({ ...h, said, meaning: '', error: '' }))
  }, [])

  /**
   * What the question says in the board's own language.
   *
   * The other direction from everything else here — see `translateHeard`, which
   * deliberately does not tell the service what language the question was in.
   */
  const translate = useCallback(async () => {
    const asked = heard.said.trim()
    if (!asked) return
    askedRef.current++
    const mine = askedRef.current
    setHeard(h => ({ ...h, working: true, error: '' }))

    const result = await translateHeard(asked)
    if (mine !== askedRef.current) return
    setHeard(h => ({
      ...h,
      working: false,
      meaning: result.status === 'ok' ? result.text : '',
      error: result.status === 'ok' ? '' : result.error,
    }))
  }, [heard.said])

  /**
   * A reply to the question, into the message box.
   *
   * The words asked about are the meaning where there is one and the heard words
   * otherwise: a model reading the question in the language it was asked in
   * answers it just as well, and the translation is there for the user rather
   * than for the model.
   */
  const suggest = useCallback(async () => {
    const asked = (heard.meaning || heard.said).trim()
    if (!asked) return
    askedRef.current++
    const mine = askedRef.current
    setHeard(h => ({ ...h, working: true, error: '' }))

    // Read at the moment of asking rather than held in state: a reply can be
    // several seconds out, and the day's window has to be the one that is true
    // when the question goes rather than when the box was opened.
    const result = await suggestReply(asked, language, replyModel, loadReplyContext())
    if (mine !== askedRef.current) return
    setHeard(h => ({ ...h, working: false, error: result.status === 'ok' ? '' : result.error }))
    if (result.status !== 'ok') return

    // The exchange, so the next question is answered as part of the same
    // conversation. Written back through storage for the reason the sent list
    // is: two replies can land without a render in between.
    saveReplyContext(addReplyTurn(loadReplyContext(), asked, result.text))
    onSuggestRef.current(result.text, result.blankAt)
  }, [heard.meaning, heard.said, language, replyModel])

  return {
    /** Whether the box above the message is shown at all. */
    open,
    heard,
    toggle,
    /** Listen again, for a question that was missed or interrupted. */
    again: startListening,
    stop: stopListening,
    correct,
    translate,
    suggest,
    /** Whether this browser can listen at all. The control is not drawn if not. */
    available: canListen(),
    /**
     * Whether this build can translate at all.
     *
     * **Not whether the board has a language set.** Whether a question needs
     * translating is a fact about the question rather than about the board — a
     * nurse speaking Spanish to a board nobody has set a language on is the
     * ordinary case — and Peri cannot know it without asking. So the control is
     * offered whenever there is anything behind it.
     */
    canTranslate: hasTranslateKey(),
    /** Whether a key has been set up for suggested replies. */
    canSuggest: Boolean(replyKey),
  }
}

export type Listener = ReturnType<typeof useListen>

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
// **A suggestion is never spoken.** The answers land on the board as cells to
// choose between; choosing one puts it in the message box through the composer's
// own history, so one dwell on Undo puts back whatever was there — and it is
// said only when the person dwells on Speak, like any other message. See
// `listen/suggest.ts` for the whole of that argument.

import { useCallback, useEffect, useRef, useState } from 'react'
import { canListen, listen } from '../listen/recognition'
import { WAITING_MS } from '../listen/apology'
import { boardForReply, suggestReply } from '../listen/suggest'
import {
  addReplyTurn,
  loadAnswers,
  loadReplyContext,
  REPLY_CONTEXT_MS,
  saveAnswers,
  saveReplyContext,
} from '../core/store'
import { type Phrase } from '../core/phrases'
import { suggestionPhrases } from './suggestions'

/** What the box above the message is holding, and what is happening to it. */
export interface Heard {
  /** The words as they were said, in whatever language they were said in. */
  said: string
  /** What they say in the board's own language, once that is known. */
  /** Whether a listening session is open right now — asked for, and not yet over. */
  listening: boolean
  /**
   * Whether sound is actually coming in: from the browser opening the device to
   * it letting go of it. **Later than `listening` and sooner over** — the browser
   * asks for permission first, and stops taking sound before the session ends —
   * so this, and not that, is what the live microphone is drawn for.
   */
  hearing: boolean
  /**
   * Which of the two is still out, and `''` for neither.
   *
   * One field rather than a flag each, because the difference is visible: the
   * answers put a waiting line on the board they are going to land on, and the
   * translation does not. Two booleans would be two things to keep agreeing
   * that only one of them can ever be true.
   */
  asking: boolean
  /** The last thing that went wrong, for the line under the box. */
  error: string
}

const EMPTY: Heard = { said: '', listening: false, hearing: false, asking: false, error: '' }

/**
 * What the box says instead of a question, when there is no key it can use.
 *
 * **The box is for getting answers**, and the answers are the user's own
 * Anthropic account — so without a key that works it takes no question, typed
 * or heard, and says why and where to go, rather than listening to somebody and
 * then failing them with a person waiting.
 */
export const KEY_NOTICE = {
  missing: 'This needs your Anthropic API key. Add it in Settings, under Suggested answers.',
  refused: 'Anthropic did not accept your API key. Check it in Settings, under Suggested answers.',
} as const

/** No answers, as one array: a fresh `[]` each render would re-run everything that watches them. */
const NONE: Phrase[] = []

export function useListen({
  language,
  replyKey,
  replyModel,
  phrases,
  messageEmpty,
  onWaiting,
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
  /**
   * Every phrase on the board, which a reply prefers to be one of.
   *
   * **In the board's own order, never the order it is shown in.** The shown
   * order follows use, so it changes every time a phrase is said — which would
   * rebuild the cached board on nearly every question — and how often each one
   * is used is the one record Peri keeps that goes nowhere at all.
   */
  phrases: Phrase[]
  /**
   * Whether a suggestion has anywhere to land.
   *
   * **A suggestion never writes over words somebody already had** — the box's
   * undo is a one-step toggle, so one that replaced a half-written message could
   * not be walked back past it. It is also what decides whether a question is
   * answered without being asked to be.
   *
   * Edit mode counts as *not* empty however little is in the draft: the box is
   * showing a phrase there, and a reply landing in the message behind it would
   * be one nobody could see and an exchange nobody asked to pay for.
   */
  messageEmpty: boolean
  /**
   * A reply has been three seconds coming, which is a long silence with
   * somebody standing in front of you — see `listen/apology.ts`. Called once a
   * question, and only where the question is still the one being answered.
   *
   * **The screen says it rather than this hook**, which is the same division
   * every other sound in this app follows: nothing under `listen/` reaches the
   * synthesiser, and what is said aloud is the screen's business.
   */
  onWaiting?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [heard, setHeard] = useState<Heard>(EMPTY)
  /**
   * What clearing the box took away, so one dwell puts it back.
   *
   * The same one-step toggle the message box has, and the same controls drawn
   * with the same two glyphs: a recogniser mis-hears, and the answer to a
   * question that came out as nonsense is to empty the box and listen again —
   * which is exactly the gesture somebody needs to be able to take back, since
   * what it threw away was the only copy of what was said to them.
   */
  const [cleared, setCleared] = useState<string[]>([])
  /**
   * The most recent answers, as cells for the board.
   *
   * **Kept until newer ones replace them**, and nothing else takes them away —
   * not listening again, not a correction, not closing the box. They were
   * cleared on every one of those, on the grounds that answers to a question no
   * longer on screen might be taken for answers to the one that is; what that
   * cost was the answers themselves, gone the moment the next person spoke or
   * the box was put away, when somebody may well have wanted to go back to one.
   * The screen shows none of them while newer ones are being asked for, which
   * is the moment that risk is real — see `offered` below.
   *
   * **And kept across Peri being closed and opened again**, under the day's
   * rules — see `loadAnswers`. Read once, here, as the screen opens, and only
   * with a key: answers belong to the key that paid for them, and go with it.
   */
  const [restored] = useState(() => (replyKey ? loadAnswers() : null))
  const [suggestions, setSuggestions] = useState<Phrase[]>(() =>
    restored ? suggestionPhrases(restored.replies, 0) : NONE,
  )
  /** When the answers on the board arrived, which is what their day is counted from. */
  const answeredAtRef = useRef(restored?.at ?? 0)

  /** The way to stop whatever is listening now, or null when nothing is. */
  const stopRef = useRef<(() => void) | null>(null)

  /**
   * A key Anthropic turned away when it was asked with, which is a key that will
   * not work until it is changed. Held against the key rather than as a flag, so
   * that setting another one — here, or on another device and synchronized —
   * lifts it without anything having to remember to.
   */
  const [refusedKey, setRefusedKey] = useState('')
  const keyProblem: '' | keyof typeof KEY_NOTICE = !replyKey ? 'missing' : refusedKey === replyKey ? 'refused' : ''
  /** No key it can use, so the box takes no question at all — see `KEY_NOTICE`. */
  const locked = keyProblem !== ''
  /**
   * Bumped by anything that makes an answer stale — closing the box, listening
   * again, asking again. An answer that comes back for a question the user has
   * moved on from is dropped rather than written over what replaced it.
   */
  const askedRef = useRef(0)
  /**
   * The question the answers on screen were asked about.
   *
   * A ref rather than state, because what reads it is `chose`, and `chose`
   * reaches every memoised cell on the board — a callback that changed identity
   * with each question would re-render a couple of thousand of them for a value
   * none of them draws.
   */
  const askedForRef = useRef(restored?.question ?? '')

  const stopListening = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
  }, [])

  // Nothing may be left listening once this screen is gone. A microphone held
  // open by a component nobody can see is the worst version of this feature.
  useEffect(() => stopListening, [stopListening])

  /**
   * Answers to a question, onto the board.
   *
   * `asked` is the meaning where there is one and the heard words otherwise: a
   * model reading a question in the language it was asked in answers it just as
   * well, and the translation is there for the user rather than for the model.
   */
  const ask = useCallback(
    async (asked: string) => {
      if (!asked) return
      askedRef.current++
      const mine = askedRef.current
      // The answers already on the board stay put until these come back — see
      // `offered` for why they are not shown in the meantime — so a request that
      // fails leaves the most recent answers the most recent answers.
      setHeard(h => ({ ...h, asking: true, error: '' }))

      // Read at the moment of asking rather than held in state: a reply can be
      // several seconds out, and the day's window has to be the one that is true
      // when the question goes rather than when the box was opened.
      // The board is written out here rather than kept written out: most boards
      // never ask for a reply at all, and one that does asks once a question.
      // The board fills the silence while this is out — once, and only while
      // this is still the question being answered.
      const waited = setTimeout(() => {
        if (mine === askedRef.current) onWaiting?.()
      }, WAITING_MS)
      const result = await suggestReply(asked, language, replyModel, loadReplyContext(), boardForReply(phrases))
      clearTimeout(waited)
      if (mine !== askedRef.current) return
      if (result.status === 'error' && result.refused) {
        // Nothing this box does will work until the key changes, so it stops
        // taking questions and says why, in the box itself.
        askedRef.current++
        stopListening()
        setHeard(EMPTY)
        setCleared([])
        setRefusedKey(replyKey)
        return
      }
      setHeard(h => ({ ...h, asking: false, error: result.status === 'ok' ? '' : result.error }))
      if (result.status !== 'ok') return

      // Named only now, alongside the answers that belong to it: a failed
      // request leaves the last answers on the board, and a choice among those
      // has to be written down against the question they answered.
      askedForRef.current = asked
      answeredAtRef.current = Date.now()
      setSuggestions(suggestionPhrases(result.replies, mine))
    },
    [language, replyModel, phrases, replyKey, stopListening, onWaiting],
  )

  /**
   * One of the answers taken, which is the only thing worth remembering about
   * the exchange.
   *
   * **The one they chose, rather than the one the model put first.** Twenty
   * answers are not an exchange; what was said is. A question nobody answered
   * off the board leaves nothing behind at all, which is the honest record —
   * the old single reply was written down whether or not anybody said it, so a
   * conversation could carry on from words nobody had spoken.
   */
  const chose = useCallback((said: string) => {
    // Read back rather than closed over, for the reason the sent list is: two
    // can land without a render in between.
    saveReplyContext(addReplyTurn(loadReplyContext(), askedForRef.current, said))
  }, [])

  /** One answer taken off the board in edit mode, where the bin forgets it. */
  const forgetSuggestion = useCallback((id: string) => {
    setSuggestions(list => list.filter(p => p.id !== id))
  }, [])

  /** All of them, with the rest of the day's conversation — see `forgetReplyContext`. */
  const forgetAnswers = useCallback(() => setSuggestions(NONE), [])

  // Written down whenever they change — arriving, one binned, all forgotten —
  // as the words they were written in, against the question they answered.
  useEffect(() => {
    saveAnswers(
      suggestions.length
        ? { at: answeredAtRef.current, question: askedForRef.current, replies: suggestions.map(p => p.source) }
        : null,
    )
  }, [suggestions])

  // **Forgotten after the day, even on a board nobody reloads.** Reading them
  // back applies the day on the way in, but a tablet on a wheelchair mount can
  // stay open for a week, and "forgotten after a day" has to be true of the
  // screen as well as of what is stored.
  useEffect(() => {
    if (!suggestions.length) return
    const timer = setTimeout(forgetAnswers, answeredAtRef.current + REPLY_CONTEXT_MS - Date.now())
    return () => clearTimeout(timer)
  }, [suggestions, forgetAnswers])

  // And taken away with the key they belong to, however it went — removed in
  // Settings, or on another device and synchronized here. Storage is emptied
  // where the key is; this is the board catching up, during the render that
  // sees the key gone rather than in an effect after it, so there is no frame
  // in which answers stand on a board with no key behind them.
  const [keyedFor, setKeyedFor] = useState(replyKey)
  if (keyedFor !== replyKey) {
    setKeyedFor(replyKey)
    if (!replyKey) {
      setSuggestions(NONE)
      // And the box takes nothing more, so what it was holding goes with it.
      setHeard(EMPTY)
      setCleared([])
    }
  }

  // Whatever was listening stops the moment there is no key to answer with. An
  // effect, since stopping a microphone is not something a render may do.
  useEffect(() => {
    if (!locked) return
    askedRef.current++
    stopListening()
  }, [locked, stopListening])

  /**
   * The same asking, for a question nobody asked to have answered.
   *
   * **The dwell it saves is the point.** Somebody mid-conversation has just been
   * spoken to and has a person waiting in front of them; making them aim at a
   * button before the machine will even begin thinking spends the seconds this
   * feature exists to give back. With words already in the box there is nothing
   * to do — a message half written is how somebody says they are already
   * answering — so the control stays, for clearing the box and asking again, or
   * correcting the question first.
   *
   * **Through a ref, because `startListening` has to keep its identity.** It is
   * `again`, and it is what the recogniser's callbacks close over: rebuilt on
   * every keystroke in the message box, it would be rebuilt in the middle of
   * somebody's question. Declared above that hook rather than beside the rest of
   * the asking, since a ref has to exist before the callback that reads it.
   */
  const answer = useCallback(
    (asked: string) => {
      if (locked || !messageEmpty) return
      void ask(asked)
    },
    [ask, messageEmpty, locked],
  )
  const answerRef = useRef(answer)
  useEffect(() => {
    answerRef.current = answer
  }, [answer])

  const startListening = useCallback(() => {
    askedRef.current++
    stopListening()
    setHeard({ ...EMPTY, listening: true })

    const mine = askedRef.current
    // What the recogniser last had. Kept here rather than read back off state,
    // because the answer goes out in the same tick the listening ends in and
    // state is a render behind it.
    let latest = ''
    stopRef.current = listen(language, {
      onHeard: said => {
        if (mine !== askedRef.current) return
        // Interim results, so the box fills as the words arrive: a box that
        // stays empty for four seconds and then fills is indistinguishable from
        // a box that is broken.
        latest = said
        setHeard(h => ({ ...h, said }))
      },
      onSound: on => {
        if (mine !== askedRef.current) return
        setHeard(h => ({ ...h, hearing: on }))
      },
      onDone: error => {
        if (mine !== askedRef.current) return
        stopRef.current = null
        setHeard(h => ({ ...h, listening: false, hearing: false, error: error ?? '' }))
        // **The question has settled.** The recogniser stops when somebody stops
        // talking, and that is the one moment the whole of what they asked is in
        // hand — a final result part-way through is half a question, and a reply
        // to half a question is worse than no reply at all. Nothing is asked
        // after a failure: there is no question there, only a reason there is
        // not one.
        if (!error) answerRef.current(latest.trim())
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
      // the sort of question this app should not need asking twice. The answers
      // are not: they are the person's to go back to, and they stay.
      setHeard(EMPTY)
      // **Here and not on the way back in**, which would be the same guard
      // written twice: closing is the only way out of this box, so a box being
      // opened has already had its undo stack emptied. What it exists for is an
      // undo reaching past a whole conversation into the one before it.
      setCleared([])
      return
    }
    setOpen(true)
    // Without a key it can use, the box opens to say so and listens to nothing.
    if (!locked) startListening()
  }, [open, locked, startListening, stopListening])

  /**
   * Corrections, typed or dwelled into the box. The meaning goes stale with
   * them — it is a translation of the words that were there before — and the
   * answers stay, being the most recent there are until the corrected question
   * is asked.
   *
   * **Whatever was being asked is abandoned, and says so.** The bump drops a
   * result still on its way, and `asking` goes with it: left standing, the
   * board went on saying answers were coming that never would, and hid the
   * answers it had behind the promise.
   */
  const correct = useCallback(
    (said: string) => {
      if (locked) return
      askedRef.current++
      // **Typing stops the microphone.** Whoever is typing is saying what the
      // question is, and a recogniser still running would write the next thing
      // it heard over what they typed. Stopped rather than left to finish, and
      // the bump above means it is not answered as it goes: a typed question
      // is asked for when somebody asks for it.
      stopListening()
      setHeard(h => ({ ...h, said, error: '', asking: false, listening: false, hearing: false }))
    },
    [locked, stopListening],
  )

  /**
   * Clear when there is something to clear; otherwise put the last one back.
   *
   * **And it works the microphone, which is why there is no control for that.**
   * Emptying this box has one reason behind it — what came back was wrong — and
   * what somebody wants next is to be listened to again, so clearing starts
   * listening. Undo is that decision taken back, so it stops. One control, two
   * glyphs, and the microphone follows the words rather than being aimed at
   * separately: a row with a listen button in it asked somebody to make two
   * dwells out of one intention.
   *
   * The meaning goes with the words and does not come back with them: it is a
   * translation of what was in the box, and the box has been emptied and filled
   * again since. A stale meaning under restored words is the same wrongness a
   * stale one under corrected words would be.
   */
  const clearOrUndo = useCallback(() => {
    if (locked) return
    if (heard.said) {
      setCleared(c => [...c, heard.said])
      startListening()
      return
    }
    if (!cleared.length) return
    askedRef.current++
    stopListening()
    setHeard(h => ({
      ...h,
      listening: false,
      hearing: false,
      said: cleared[cleared.length - 1]!,
      error: '',
    }))
    setCleared(c => c.slice(0, -1))
  }, [cleared, heard.said, locked, startListening, stopListening])

  /** Asked for by a dwell on the control under the box. */
  const suggest = useCallback(() => ask(heard.said.trim()), [ask, heard.said])

  return {
    /** Whether the box above the message is shown at all. */
    open,
    heard,
    /**
     * The answers on offer, as cells for the board: the most recent there are,
     * and **none while newer ones are being asked for**. Those seconds are the
     * one moment answers to the last question could be taken for answers to
     * this one, and the board shows the line saying new ones are coming instead
     * — which it could not do over twenty cells. Held back rather than thrown
     * away, so a request that fails puts them straight back.
     */
    suggestions: heard.asking ? NONE : suggestions,
    chose,
    forgetSuggestion,
    forgetAnswers,
    toggle,
    stop: stopListening,
    correct,
    clearOrUndo,
    /** Which of the two the one control is offering, exactly as the composer's does. */
    showUndo: !locked && !heard.said && cleared.length > 0,
    canClear: !locked && (Boolean(heard.said) || cleared.length > 0),
    /**
     * What the box says instead of a question when there is no key it can use,
     * and `''` when it takes questions. The box shows it as its words, read-only,
     * so it is measured like any question and grows to hold it.
     */
    notice: keyProblem ? KEY_NOTICE[keyProblem] : '',
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
    /** Whether a key has been set up for suggested replies. */
    canSuggest: Boolean(replyKey),
    /**
     * Handed straight back, so the control under the box and the question that
     * answers itself are asking one thing rather than two that have to agree.
     */
    messageEmpty,
  }
}

export type Listener = ReturnType<typeof useListen>

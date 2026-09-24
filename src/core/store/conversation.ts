// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { ANSWERS_KEY, APOLOGIES_KEY, REPLY_CONTEXT_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── What has been asked and answered today ────────────────────────────────────
// A conversation rather than a series of unrelated questions: "tea or coffee?"
// followed by "milk?" is one exchange, and a reply to the second that had never
// seen the first would be answering a different question.
//
// **It expires.** A day is the longest any of it is worth keeping — a carer's
// shift, a hospital visit, an afternoon — and a transcript of what was said to
// somebody in a care room is not a thing to hold on to on their behalf. Pruned
// on the way *out* as well as on the way in, so a board left open overnight
// forgets on its own rather than waiting for the next question to notice.
//
// It is a record of what somebody was actually asked, so it follows the Sent
// list's rules exactly: its own key, never in a backup, never in a snapshot, and
// cleared by a factory reset.

/** One exchange: what was asked, and what was offered back. */
export interface ReplyTurn {
  at: number
  question: string
  reply: string
}

/** How long an exchange is worth remembering. */
export const REPLY_CONTEXT_MS = 24 * 60 * 60 * 1000

/**
 * How many exchanges go back to the model.
 *
 * Every one of them is sent again with the next question, so this is paid for
 * in tokens and in the seconds somebody is waiting. Twenty is a long
 * conversation and a short prompt.
 */
const REPLY_CONTEXT_LIMIT = 20

/** Today's exchanges, oldest first, with anything older than a day already gone. */
export function loadReplyContext(now = Date.now()): ReplyTurn[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(REPLY_CONTEXT_KEY)) ?? '[]')
    if (!Array.isArray(raw)) return []
    return (raw as ReplyTurn[])
      .filter(
        (t): t is ReplyTurn =>
          typeof t === 'object' &&
          t !== null &&
          typeof t.question === 'string' &&
          typeof t.reply === 'string' &&
          typeof t.at === 'number' &&
          Number.isFinite(t.at) &&
          now - t.at < REPLY_CONTEXT_MS,
      )
      .slice(-REPLY_CONTEXT_LIMIT)
  } catch {
    return []
  }
}

export function saveReplyContext(turns: ReplyTurn[]) {
  if (turns.length === 0) localStorage.removeItem(storageKey(REPLY_CONTEXT_KEY))
  else writeKey(storageKey(REPLY_CONTEXT_KEY), JSON.stringify(turns))
}

/** The exchanges after this one, with the day's window applied. */
export function addReplyTurn(turns: ReplyTurn[], question: string, reply: string, at = Date.now()): ReplyTurn[] {
  const asked = question.trim()
  const said = reply.trim()
  if (!asked || !said) return turns
  return [...turns.filter(t => at - t.at < REPLY_CONTEXT_MS), { at, question: asked, reply: said }].slice(
    -REPLY_CONTEXT_LIMIT,
  )
}

/**
 * Forget the conversation. Its own control, beside the key it belongs to.
 *
 * **The answers last offered go with it.** They are part of the same day's
 * exchange — twenty lines written in answer to something somebody was asked —
 * and a control that forgot the questions and left the answers to them on the
 * board would have forgotten half of what it says it did.
 */
export function forgetReplyContext() {
  localStorage.removeItem(storageKey(REPLY_CONTEXT_KEY))
  localStorage.removeItem(storageKey(ANSWERS_KEY))
}

// ── The answers last offered ─────────────────────────────────────────────────
// The most recent answers stay on the board until newer ones replace them, and
// that includes Peri being closed and opened again: a board on a mounted device
// is reloaded by whoever charges it, not by the person using it, and answers
// that went with every reload were answers gone at somebody else's say-so.
//
// **The day's rules, because they are the day's conversation.** Forgotten after
// the same day the questions are, forgotten with them, never in a backup and
// never in a snapshot, and cleared by a factory reset. Kept as the words the
// answers were written in rather than as phrases, so how a gap is drawn can
// change between releases without a stored answer being drawn the old way.

/** The answers last offered, and the question they answered. */
export interface KeptAnswers {
  /** When they arrived, which is what a day is counted from. */
  at: number
  question: string
  replies: string[]
}

/** The answers last offered, or null when there are none or they are a day old. */
export function loadAnswers(now = Date.now()): KeptAnswers | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(ANSWERS_KEY)) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { at, question, replies } = raw as Partial<KeptAnswers>
    if (typeof at !== 'number' || !Number.isFinite(at) || now - at >= REPLY_CONTEXT_MS) return null
    if (typeof question !== 'string' || !Array.isArray(replies)) return null
    const kept = replies.filter((r): r is string => typeof r === 'string' && r.trim() !== '')
    return kept.length ? { at, question, replies: kept } : null
  } catch {
    return null
  }
}

/** Keep these, or — given none — take the key away entirely. */
export function saveAnswers(answers: KeptAnswers | null) {
  if (!answers || answers.replies.length === 0) localStorage.removeItem(storageKey(ANSWERS_KEY))
  else writeKey(storageKey(ANSWERS_KEY), JSON.stringify(answers))
}

// ── What the board says while a reply is being written ───────────────────────

/**
 * The apologies the board has ready, and the ones it has already said.
 *
 * **Kept rather than asked for at the moment of waiting**, which is the whole
 * point of them: somebody is already waiting, and a request to fill the silence
 * would be a second thing to wait for.
 */
export interface Apologies {
  /** Ready to be said, each of them once. */
  ready: string[]
  /** What has been said, and when, so that none of it is said twice in an hour. */
  said: { text: string; at: number }[]
}

/** How long an apology rests before it can be said again. */
export const APOLOGY_REST_MS = 60 * 60_000

export const NO_APOLOGIES: Apologies = { ready: [], said: [] }

/**
 * **Forgotten an hour after it was said**, pruned on the way out as well as on
 * the way in: a board left open all afternoon should not keep a record of what
 * it said this morning, and a board opened once a week has nothing to remember.
 */
export function loadApologies(now = Date.now()): Apologies {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(APOLOGIES_KEY)) ?? 'null')
    if (!raw || typeof raw !== 'object') return NO_APOLOGIES
    const { ready, said } = raw as Partial<Apologies>
    return {
      ready: Array.isArray(ready) ? ready.filter(t => typeof t === 'string' && t) : [],
      said: Array.isArray(said)
        ? said.filter(
            (s): s is { text: string; at: number } =>
              typeof s?.text === 'string' && typeof s?.at === 'number' && now - s.at < APOLOGY_REST_MS,
          )
        : [],
    }
  } catch {
    return NO_APOLOGIES
  }
}

export function saveApologies(apologies: Apologies, now = Date.now()) {
  const said = apologies.said.filter(s => now - s.at < APOLOGY_REST_MS)
  if (apologies.ready.length === 0 && said.length === 0) localStorage.removeItem(storageKey(APOLOGIES_KEY))
  else writeKey(storageKey(APOLOGIES_KEY), JSON.stringify({ ready: apologies.ready, said }))
}

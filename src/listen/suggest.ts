// A suggested answer to a question that was heard.
//
// The riskiest thing in this app, and the comments below are mostly about that.
// **Peri exists to say what somebody means**, and a machine offering words for
// them to say is one step from a machine deciding what they meant. So the whole
// design is arranged around one rule:
//
//   **A suggestion is never spoken.** It lands in the message box, where it can
//   be read, changed, cleared or ignored, and it is said only when the person
//   dwells on Speak — the same dwell every other message needs. Nothing here
//   reaches the synthesiser, and nothing here is ever auto-spoken.
//
// Three more things follow from it:
//
//   * **It goes through the box's own undo.** Whatever was in the box before is
//     on the history stack, so one dwell on Undo puts their own words back.
//   * **It is short, first person, and in the board's language**, because it is
//     going to be read by the person who would have to say it, on a screen that
//     is mostly grid.
//   * **The key is theirs.** It bills them for something they chose, the way the
//     ElevenLabs key does — and unlike the translation key it cannot be made safe
//     to inline, since nothing restricts an Anthropic key to one site.
//
// **Nothing throws.** Every failure is a value, and the worst case is a box left
// exactly as it was with a line of text saying why.

import { reportFailure } from '../core/report'
import { BLANK } from '../core/phrases'
import { loadReplyKey, readReplyModel, type ReplyTurn } from '../core/store'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'

/**
 * Two sentences at the outside. Longer than that is not a reply, it is a speech.
 *
 * The budget covers a search query as well as the words, since both are output —
 * so it is not as tight as the two sentences it is protecting. What keeps the
 * reply short is the brief; this is only the backstop under it.
 */
const MAX_TOKENS = 400

/**
 * Looking something up, when the model judges that it has to.
 *
 * **The one capability here that costs time somebody is standing in front of
 * them for**, so it is bounded hard: the model decides whether to search at all,
 * and may do it once. A question it can answer from what it knows is as quick as
 * it ever was, and one that genuinely needs looking up takes a few seconds
 * rather than an open-ended number of them.
 *
 * A search sends the question on to a search index as well as to Anthropic,
 * which is a disclosure rather than a detail — the Settings row, the guide and
 * the privacy policy all say so.
 */
const SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 1 }

export type SuggestResult =
  | {
      status: 'ok'
      text: string
      /** Where the first gap landed, or -1. The caret goes there — see `BLANK`. */
      blankAt: number
    }
  | { status: 'error'; error: string }

/**
 * Two or more underscores, which is what the brief asks a gap to be written as.
 *
 * Two rather than exactly three, because a model asked for `___` will sometimes
 * write `__` or `____`, and a reply with visible underscores in it is worse than
 * one whose gap is a character wider than it was asked for.
 */
const GAP = /_{2,}/g

/**
 * The reply with its gaps opened out, and where the first one landed.
 *
 * `BLANK` is the empty string, so taking a gap out leaves the text either side
 * of it spaced exactly as it was — and nothing before the first gap has moved,
 * which is what makes its index in the answer its index in the finished words.
 */
function withGaps(said: string): { text: string; blankAt: number } {
  return { text: said.replace(GAP, BLANK), blankAt: said.search(GAP) }
}

function fail(error: string): SuggestResult {
  reportFailure('suggest', error)
  return { status: 'error', error }
}

/** Whether a key has been set up at all. Asked before the control is offered. */
export const hasReplyKey = (): boolean => Boolean(loadReplyKey())

function describe(status: number): string {
  if (status === 401) return 'The key was not accepted — check it in Settings'
  if (status === 403) return 'That key is not allowed to do this'
  if (status === 429) return 'Too many requests — try again in a moment'
  if (status >= 500) return 'The suggestion service is having trouble'
  return `The suggestion service said ${status}`
}

/**
 * What the model is told about its job.
 *
 * Written to be read by whoever has to defend it. Every line is a limit rather
 * than an instruction to be clever: one reply, short, first person, no preamble.
 *
 * **A gap, not a question back.** What it must not state about them it leaves a
 * hole in, and the hole is the app's own blank: the caret lands in it and the
 * words are typed into the gap, exactly as a fill-in-the-blank phrase off the
 * board works. Asking "which tablets?" would be a machine interviewing somebody
 * who is already having to spell their answers out one letter at a time.
 *
 * **The line that matters is about *whose* facts.** A board that answered "yes,
 * I took them at eight" to a question about medication would be putting a
 * clinical claim in somebody's mouth, and no amount of usefulness is worth that.
 * But the guard used to be written as facts in general, which a model reads as
 * covering the capital of France — so it dodged questions nobody could come to
 * harm over, and the whole thing read as broken rather than careful.
 *
 * So the split is explicit: **the world it may answer for, the person it may
 * not.** A carer asking what day it is gets an answer; a carer asking whether
 * the tablets were taken gets a question back.
 */
const BRIEF = [
  'You are helping someone who communicates through an assistive board.',
  'They have been asked a question out loud and need something to say back.',
  'Write one short reply in the first person, as they would say it — at most two sentences.',
  'Reply with the words themselves and nothing else: no preamble, no options, no quotation marks, no citations.',
  'A question about the world you may answer, from what you know or by searching.',
  'A question about THEM you may not: never state what they did, felt, want, own, were given or were told, unless it is in what you were sent.',
  'If the question asks for one of those, write the reply with a gap where the fact goes, marked ___, and let them fill it in.',
  'Never ask them a question back and never say you do not know: a gap is the answer to anything you were not told.',
].join(' ')

/**
 * What day it is, which the model has no way of knowing otherwise.
 *
 * A bare API call carries no clock. Without this, "what day is it", "is that
 * this week" and every other question with a *when* in it were unanswerable —
 * not refused, which would at least read as a limit, but answered out of a
 * model's training data as though the year had not moved.
 *
 * Taken off the device rather than from anywhere else: it is the clock the
 * person being asked is living by.
 */
const today = () => new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * Ask for a reply to a question.
 *
 * `language` is what the reply should be written in, and it is the board's own
 * language rather than the question's: the suggestion is going into the message
 * box for somebody to read, and everything else they read is in their language.
 * What happens to it on the way *out* is the translation that was already there.
 *
 * `context` is what has already been asked and answered today, oldest first —
 * see `loadReplyContext`. It goes back as the turns it was: "tea or coffee?"
 * followed by "milk?" is one exchange, and a reply to the second that had never
 * seen the first would be answering a different question.
 *
 * `model` is the setting — see `REPLY_MODELS`. Held to the list here as well as
 * where it is stored, because this is the last point before it becomes somebody
 * else's API call and a name that is not one would fail on the question rather
 * than on the setting. Absent falls back through the same check rather than
 * through a default of its own: two places saying which model to use is one
 * place too many.
 */
/**
 * The reply out of the turn that came back, and **only the reply.**
 *
 * With a search in the turn there are several blocks: whatever the model said
 * before it looked anything up, the search itself, what came back, and then the
 * answer. Joining every text block would put "Let me look that up" into the
 * message box in front of the words, so the answer is taken as the run of text
 * **after the last block that is not text** — which is the search result where
 * there was one, and nothing at all where there was not.
 *
 * **That cut is the whole of the guard**, and there is deliberately not a second
 * one filtering the slice by type as well: everything after the last non-text
 * block is text by construction, so a filter there could never fire and would
 * only make this look as though it were checked twice. What it protects against
 * is a block of some other kind carrying a `text` field — a model's own working,
 * put into an assistive board's message box for somebody to say out loud, is the
 * worst thing this could do.
 */
function readReply(content: { type?: string; text?: unknown }[]): SuggestResult {
  let from = 0
  for (let i = 0; i < content.length; i++) {
    if (content[i].type !== 'text') from = i + 1
  }

  const said = content
    .slice(from)
    .map(part => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim()

  return said ? { status: 'ok', ...withGaps(said) } : fail('The suggestion service sent back nothing')
}

export async function suggestReply(
  question: string,
  language: string,
  model?: string,
  context: ReplyTurn[] = [],
): Promise<SuggestResult> {
  const asked = question.trim()
  if (!asked) return fail('Nothing to reply to')

  const key = loadReplyKey()
  if (!key) return fail('No key for suggested replies — add one in Settings')

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Anthropic refuses a browser request without it. The key is the user's
        // own and never leaves their device except to Anthropic, which is the
        // same shape the ElevenLabs key already travels in.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: readReplyModel(model),
        max_tokens: MAX_TOKENS,
        tools: [SEARCH_TOOL],
        system: [BRIEF, `Today is ${today()}.`, language && `Write the reply in ${language}.`]
          .filter(Boolean)
          .join(' '),
        messages: [
          // Each exchange as the two turns it was, so the model reads the
          // conversation rather than a question with a summary bolted to it.
          ...context.flatMap(turn => [
            { role: 'user', content: `Someone just asked me: ${turn.question}` },
            { role: 'assistant', content: turn.reply },
          ]),
          { role: 'user', content: `Someone just asked me: ${asked}` },
        ],
      }),
    })
    if (!response.ok) return fail(describe(response.status))

    const body = (await response.json()) as { content?: { type?: string; text?: unknown }[] }
    return readReply(body.content ?? [])
  } catch {
    return fail('Could not reach the suggestion service')
  }
}

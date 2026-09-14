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
import { DEFAULT_REPLY_MODEL, loadReplyKey, readReplyModel } from '../core/store'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'

/** Two sentences at the outside. Longer than that is not a reply, it is a speech. */
const MAX_TOKENS = 150

export type SuggestResult = { status: 'ok'; text: string } | { status: 'error'; error: string }

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
 * than an instruction to be clever: **one reply, short, first person, no
 * preamble, and no invention of facts about a person it knows nothing about.**
 * The last of those is the one that matters most — a board that answered "yes,
 * I took them at eight" to a question about medication would be putting a
 * clinical claim in somebody's mouth.
 */
const BRIEF = [
  'You are helping someone who communicates through an assistive board.',
  'They have been asked a question out loud and need something to say back.',
  'Write one short reply in the first person, as they would say it — at most two sentences.',
  'Reply with the words themselves and nothing else: no preamble, no options, no quotation marks.',
  'Never state a fact about them you were not told. If the question asks for one, answer in a way that does not invent it.',
  'If the question cannot be answered without knowing more, write a short reply asking for what is missing.',
].join(' ')

/**
 * Ask for a reply to a question.
 *
 * `language` is what the reply should be written in, and it is the board's own
 * language rather than the question's: the suggestion is going into the message
 * box for somebody to read, and everything else they read is in their language.
 * What happens to it on the way *out* is the translation that was already there.
 *
 * `model` is the setting — see `REPLY_MODELS`. Held to the list here as well as
 * where it is stored, because this is the last point before it becomes somebody
 * else's API call and a name that is not one would fail on the question rather
 * than on the setting.
 */
export async function suggestReply(
  question: string,
  language: string,
  model: string = DEFAULT_REPLY_MODEL,
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
        system: language ? `${BRIEF} Write the reply in ${language}.` : BRIEF,
        messages: [{ role: 'user', content: `Someone just asked me: ${asked}` }],
      }),
    })
    if (!response.ok) return fail(describe(response.status))

    const body = (await response.json()) as { content?: { type?: string; text?: unknown }[] }
    const said = body.content
      ?.filter(part => part.type === 'text')
      .map(part => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim()

    return said ? { status: 'ok', text: said } : fail('The suggestion service sent back nothing')
  } catch {
    return fail('Could not reach the suggestion service')
  }
}

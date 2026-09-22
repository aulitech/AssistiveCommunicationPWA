// What the board says out loud while a reply is being written.
//
// **Three seconds is a long silence with somebody standing in front of you.**
// The person using this board cannot fill it — filling it is the thing they
// came here for — so the board fills it for them: one short apology, said once,
// while the answers are still coming.
//
// Three rules hold it together, and each is somebody's dignity rather than a
// nicety:
//
//   * **It is never the same words twice in an hour.** A machine that says the
//     same sentence every time is a machine somebody is listening to, not a
//     person they are talking to, and the apology stops being an apology.
//   * **It is ready before it is needed.** The whole failure it covers is a
//     wait, so it cannot be fetched during one — `Apologies.ready` is kept full
//     in the background, and `SHIPPED` is what answers when it is empty, when
//     there is no key, and when there is no network.
//   * **It is not something the person said.** The caller says it without
//     recording it: it is not in the Sent list, it is not counted towards any
//     phrase, and it is not in the conversation the next reply is written
//     against. The board apologised for itself.

import { headersFor, readReplies } from './suggest'
import { APOLOGY_REST_MS, DEFAULT_REPLY_MODEL, loadReplyKey, type Apologies } from '../core/store'
import { reportFailure } from '../core/report'

/** How long a reply may take before the board says anything at all. */
export const WAITING_MS = 3000

/** How many to keep ready. Enough for a run of slow answers in one conversation. */
export const APOLOGY_CACHE = 5

/**
 * The ones the app ships with, which are the answer whenever there is nothing
 * else: no key, no network, a request that failed, or five said already.
 *
 * **A board never fails into silence**, and that holds here too — this is the
 * surface whose whole job is to not be silent.
 */
export const SHIPPED_APOLOGIES = [
  'Sorry, this is taking me a moment.',
  'One moment, I am still working on my answer.',
  'Bear with me, I am nearly there.',
  'Sorry to keep you — this one is taking a little longer.',
  'Just a moment more, please.',
]

const rested = (text: string, said: Apologies['said'], now: number) =>
  !said.some(s => s.text === text && now - s.at < APOLOGY_REST_MS)

/** The one said longest ago, for when everything has been said within the hour. */
function saidLongestAgo(said: Apologies['said']): string | undefined {
  return [...said].sort((a, b) => a.at - b.at)[0]?.text
}

/**
 * The next apology to say, and the cache as it stands afterwards.
 *
 * The ones written for this board come first and are used up as they are said;
 * the shipped ones are always there behind them. Where everything has been said
 * within the hour, the one said longest ago comes round again — a repeat is
 * better than the silence this exists to fill.
 */
export function nextApology(cache: Apologies, now = Date.now()): { text: string; cache: Apologies } {
  const text =
    cache.ready.find(t => rested(t, cache.said, now)) ??
    SHIPPED_APOLOGIES.find(t => rested(t, cache.said, now)) ??
    saidLongestAgo(cache.said) ??
    SHIPPED_APOLOGIES[0]

  return {
    text,
    cache: {
      ready: cache.ready.filter(t => t !== text),
      said: [...cache.said.filter(s => s.text !== text), { text, at: now }],
    },
  }
}

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MAX_TOKENS = 400

/**
 * The brief. Short, said aloud, and about the wait rather than about the
 * person: the board is apologising for itself, and an apology that spoke for
 * its owner would be putting words in their mouth — the line everything in
 * `suggest.ts` is drawn around.
 */
function briefFor(want: number, language: string): string {
  return [
    `Write ${want} different short apologies for a delay, one to a line and nothing else.`,
    'They are said aloud by a communication board while it works out what to say next, to whoever is waiting in the room.',
    'First person, one sentence each, polite and ordinary — what a person would say, not what a machine would.',
    'They apologise for the wait itself. Say nothing about why, nothing about the person using the board, and nothing about what they are going to say.',
    'No numbering, no quotation marks, no preamble.',
    language && `Write them in ${language}.`,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * More apologies, written for this board.
 *
 * **Nothing of theirs is in the request** — no question, no phrase off the
 * board, no conversation — which is why it can be asked for at any time rather
 * than only when somebody is being answered. It is the quickest model whatever
 * the board is set to: these are five short sentences nobody is reading, and
 * the setting is about the answers somebody will actually say.
 *
 * **Nothing throws, and a failure costs nothing**: the shipped ones are what
 * `nextApology` falls back to, and the next fill will try again.
 */
export async function moreApologies(want: number, language: string): Promise<string[]> {
  if (want <= 0) return []
  const key = loadReplyKey()
  if (!key) return []

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headersFor(key) },
      body: JSON.stringify({
        model: DEFAULT_REPLY_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: briefFor(want, language) }],
      }),
    })
    if (!response.ok) {
      // Never the key, and there is nothing else in this request to leak.
      reportFailure('apology', `Anthropic answered with ${response.status}`)
      return []
    }
    const data = (await response.json()) as { content?: { type?: string; text?: string }[] }
    const said = (data.content ?? [])
      .filter(block => block.type === 'text')
      .map(block => block.text ?? '')
      .join('\n')
    return readReplies(said).slice(0, want)
  } catch {
    reportFailure('apology', 'Could not reach Anthropic for more apologies')
    return []
  }
}

// Suggested answers to a question that was heard.
//
// The riskiest thing in this app, and the comments below are mostly about that.
// **Peri exists to say what somebody means**, and a machine offering words for
// them to say is one step from a machine deciding what they meant. So the whole
// design is arranged around one rule:
//
//   **A suggestion is never spoken.** They arrive as answers on the board, to
//   be read, chosen among or ignored; choosing one puts it in the message box,
//   and it is said only when the person dwells on Speak — the same dwell every
//   other message needs. Nothing here reaches the synthesiser.
//
// Three more things follow from it:
//
//   * **There are up to twenty of them**, because one reply is a machine
//     deciding what somebody meant and twenty is a choice they make. One per
//     line is the whole of the format — see `readReplies`.
//   * **Each is short, first person, and in the board's language**, because
//     they are going to be read by the person who would have to say them, on a
//     screen that is mostly grid.
//   * **The key is theirs.** It bills them for something they chose, the way the
//     ElevenLabs key does — and unlike the translation key it cannot be made safe
//     to inline, since nothing restricts an Anthropic key to one site.
//
// **Nothing throws.** Every failure is a value, and the worst case is a board
// left exactly as it was with a line of text saying why.

import { reportFailure } from '../core/report'
import { type Phrase } from '../core/phrases'
import { soleLink, stripMarkdown } from '../core/markdown'
import { loadReplyKey, readReplyModel, type ReplyTurn } from '../core/store'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'

/**
 * Twenty answers of two sentences at the outside, and a search query with them,
 * since a query is output too.
 *
 * It is a backstop rather than a limit anybody should reach: what keeps each
 * answer short is the brief, and what keeps them few is `MAX_REPLIES`. Running
 * out mid-list costs the last answer rather than the lot — a truncated line is
 * dropped with the rest of the parse.
 */
const MAX_TOKENS = 1200

/**
 * How many answers the board is offered, and it is a number about the board
 * rather than about the model: twenty cells is a screen somebody can read by
 * gaze, and the twenty-first would be one nobody ever reaches.
 */
export const MAX_REPLIES = 20

/**
 * How many of those may be phrases off their own board.
 *
 * **A third, and it is a cap rather than a target.** The board is worth having
 * in the list — those are words they chose and already know how to read — and
 * it is not worth the whole list: two thousand phrases hold something loosely
 * on topic for any question ever asked, so a model told to offer the ones that
 * fit filled all twenty from the table and the feature became a search of the
 * board. What somebody is missing when they are asked something is usually the
 * words they have not got.
 *
 * The brief asks for the third; this enforces it, because a brief is a request.
 */
const FROM_BOARD_CAP = Math.ceil(MAX_REPLIES / 3)

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
  /** The answers as the model wrote them, best first — gaps and all. */
  { status: 'ok'; replies: string[] } | { status: 'error'; error: string }

/**
 * A line's own numbering or bullet, which the brief asks for and does not get.
 *
 * A model writing a list writes a list, and "1. Tea please" on a board is a
 * phrase with a number in front of it that somebody's speaker reads out.
 */
const LIST_MARK = /^\s*(?:[-–—*•·]|\(?\d{1,2}[.):])\s+/

/** Quotation marks around a whole line, for the same reason. */
const QUOTED = /^["'“”‘’](.*)["'“”‘’]$/

/**
 * The answers out of the run of text: **one to a line, and nothing else.**
 *
 * A format a model cannot half-follow is worth more here than a strict one: no
 * JSON to be truncated, no beta header, and a line that came back malformed
 * costs its own line rather than the whole list.
 *
 * - **Numbering and quotation marks come off**, because the brief asking for
 *   neither is not the same as never getting them, and both end up spoken.
 * - **The same answer twice is one answer**, matched without regard to case: a
 *   second cell saying what the first says is a target spent for nothing.
 * How many are kept is not decided here — see `mixed`, which has the board to
 * compare them against.
 */
function readReplies(said: string): string[] {
  const seen = new Set<string>()
  const replies: string[] = []
  for (const raw of said.split('\n')) {
    const line = raw.replace(LIST_MARK, '').replace(QUOTED, '$1').replace(/\s+/g, ' ').trim()
    if (!line || seen.has(line.toLowerCase())) continue
    seen.add(line.toLowerCase())
    replies.push(line)
  }
  return replies
}

/**
 * The list as it will be drawn: a third of it off their board at the outside,
 * twenty cells at the outside, and otherwise exactly the order it came in.
 *
 * **The cap drops rather than reorders.** Best-first is the model's judgement
 * and this has none to put in its place, so a list that came back all from the
 * board loses its overflow and is drawn shorter — which is the visible sign
 * that the brief was not followed, and better than twenty cells of a board the
 * person can already read for themselves.
 *
 * Matched on the words, since that is what the board was sent as: a phrase the
 * model reworded is one it wrote, which is the right side of the line anyway.
 */
function mixed(replies: string[], board: string[]): string[] {
  const theirs = new Set(board.map(line => line.toLowerCase()))
  let fromBoard = 0
  const kept: string[] = []
  for (const reply of replies) {
    if (theirs.has(reply.toLowerCase()) && ++fromBoard > FROM_BOARD_CAP) continue
    kept.push(reply)
    if (kept.length === MAX_REPLIES) break
  }
  return kept
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
 * than an instruction to be clever: short answers, first person, no preamble.
 *
 * **An expert in whatever the question is about, which is one instruction to be
 * clever and it earns its place.** The person answering cannot add the
 * sentence the machine left out — every correction costs them a letter at a
 * time — so a vague or hedged answer is not a starting point they can improve,
 * it is the whole of what they get to say. What that must not become is a
 * lecture: expert in the *subject*, in two sentences of the plain words they
 * would have used, and never expert about **them**.
 *
 * **Twenty answers rather than one**, which is the difference between a machine
 * deciding what somebody meant and a machine laying out what they might mean.
 * One reply put a stranger's sentence in the message box and left the person to
 * accept it or start again by spelling; twenty fill the board they already
 * choose everything else from, and the one they rest on is a choice.
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
  `Write up to ${MAX_REPLIES} different replies they could choose between, in the first person, as they would say them — each at most two sentences.`,
  'One reply to a line, best first, and nothing else on the line: no numbering, no bullets, no headings, no blank lines between them, no quotation marks, no citations.',
  'Make them worth choosing between: the short plain answers first, then fuller ones, and never two that say the same thing.',
  'A question about the world you may answer, from what you know or by searching.',
  'Answer it as an expert in whatever it is about — the medicine, the law, the car, the recipe, the league table — so what they say back is accurate and particular rather than vague or hedged, and worth saying to somebody who knows the subject themselves.',
  'Knowing the subject is not talking like one: still at most two sentences, still the plain words they would say out loud, and never a lecture.',
  'Expert in the subject and never about them. A question about THEM you may not answer: never state what they did, felt, want, own, were given or were told, unless it is in what you were sent.',
  'If the question asks for one of those, write the reply with a gap where the fact goes, marked ___, and let them fill it in.',
  'Never ask them a question back and never say you do not know: a gap is the answer to anything you were not told.',
  'Where a question has a handful of real answers, give each its own line rather than one line with a gap: "Tea please" and "Coffee please" rather than "I would like ___".',
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
 * What the model is told about the board it is given.
 *
 * **Their own words, but not only their own words.** A phrase off the board is
 * in words they chose, or at least kept, and one they already know how to read
 * — so they are worth a third of the list. They are not worth all of it: a
 * board of two thousand phrases has something loosely on topic for any question
 * ever asked, so "offer the ones that answer it" filled every cell from the
 * table and the feature became a search of the board. What somebody is missing
 * when they are asked something is usually the words they have *not* got.
 *
 * **What they can say, not what is true of them.** The rule above lets the model
 * state what "is in what you were sent", and a board holding "I have taken my
 * tablets" was sent. So the phrases are named as the opposite of evidence, in as
 * many words, and a phrase stating something about them is held to the same
 * rule as a sentence the model wrote itself: what to reach for instead is one
 * with a gap where the fact goes, which a board full of fill-in-the-blank
 * phrases usually has.
 */
const BOARD_BRIEF = [
  'Below are the phrases on their board, one to a line.',
  `Use their own phrases for at most a third of the list — the ${FROM_BOARD_CAP} best of them at the outside, however many others would fit — written exactly as they are, gaps included.`,
  'They are what they are able to say, not facts about them. A phrase that states what they did, felt or want is held to the rule above like any other words, so use one with a gap where the fact goes instead, or write one.',
  'Write the rest of the list yourself, in their voice: the answers somebody would actually give, and above all the ones their board has not got.',
  'Where the question needed looking up, let some of those use what you found.',
  'Mix the three kinds through the list rather than grouping them, best first: the first few cells are the ones a tired reader gets to, and all of one kind there is a list that looks like one answer.',
].join(' ')

/** Where a slot sat, while the markup comes off around it. Never in a phrase. */
const SLOT = '\uE001'

/**
 * The board as the model is given it: one line a phrase, written the way a gap
 * in a reply is written, so a phrase chosen off it lands with its caret in the
 * gap exactly as one chosen off the grid does.
 *
 * - **A slot with a choice in it is a gap.** Which of the choices is theirs to
 *   say, and it is usually the fact the rule above keeps out of the model's
 *   hands — "I want the red one" is a want. A slot with one option is that word,
 *   which is how the board reads it.
 * - **The words, not the markup**, for the reason speech and search take it
 *   off: nobody says the asterisks. The markup comes off with the slots held in
 *   place by a character nothing writes, so a gap's underscores are never read
 *   as emphasis.
 * - **Not a phrase that is only a link.** That is a button for going somewhere,
 *   and its label is not something anybody says.
 * - **Each wording once.** "Good morning" is filed under three categories, and a
 *   phrase listed three times is three times the tokens and no more likely to
 *   be the answer.
 */
export function boardForReply(phrases: Phrase[]): string[] {
  const lines = new Set<string>()
  for (const phrase of phrases) {
    if (soleLink(phrase.segments)) continue
    const written = phrase.segments
      .map(s => (s.kind === 'text' ? s.text : s.options.length === 1 ? s.options[0] : SLOT))
      .join('')
    const line = stripMarkdown(written).split(SLOT).join('___').replace(/\s+/g, ' ').trim()
    if (line) lines.add(line)
  }
  return [...lines]
}

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
 * The answers out of the turn that came back, and **only the answers.**
 *
 * With a search in the turn there are several blocks: whatever the model said
 * before it looked anything up, the search itself, what came back, and then the
 * answer. Joining every text block would put "Let me look that up" on the board
 * as an answer, so the answers are taken from the run of text **after the last
 * block that is not text** — which is the search result where there was one,
 * and nothing at all where there was not.
 *
 * **That cut is the whole of the guard**, and there is deliberately not a second
 * one filtering the slice by type as well: everything after the last non-text
 * block is text by construction, so a filter there could never fire and would
 * only make this look as though it were checked twice. What it protects against
 * is a block of some other kind carrying a `text` field — a model's own working,
 * drawn on an assistive board for somebody to say out loud, is the worst thing
 * this could do.
 */
function readReply(content: { type?: string; text?: unknown }[]): string[] {
  let from = 0
  for (let i = 0; i < content.length; i++) {
    if (content[i].type !== 'text') from = i + 1
  }

  const said = content
    .slice(from)
    .map(part => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim()

  return readReplies(said)
}

export async function suggestReply(
  question: string,
  language: string,
  model?: string,
  context: ReplyTurn[] = [],
  /** The phrases on the board, from `boardForReply`. The model is told to prefer them. */
  board: string[] = [],
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
        // **The board is cached.** It is thirteen thousand tokens on a board
        // nobody has added to, and the same from one question to the next, so
        // it carries the one mark and nothing that changes between questions
        // sits in it or before it: the date goes after, the question in the
        // messages. Read back, it costs a tenth of what reading it again would.
        //
        // **For an hour, not the default five minutes.** A conversation in a
        // care room is not a chat: a question, then twenty minutes of nothing,
        // then whoever comes through the door next. At five minutes nearly
        // every question would pay to write the board again, and an hour's
        // entry pays for its dearer write by the third question.
        system: [
          { type: 'text', text: BRIEF },
          ...(board.length
            ? [
                {
                  type: 'text',
                  text: `${BOARD_BRIEF}\n\n${board.join('\n')}`,
                  cache_control: { type: 'ephemeral', ttl: '1h' },
                },
              ]
            : []),
          {
            type: 'text',
            text: [
              `Today is ${today()}.`,
              // The board is in the words it was written in, and a reply in
              // another language has to be allowed to be a phrase off it too.
              language &&
                `Write the reply in ${language}${board.length ? ', translating a phrase from their board if you use one' : ''}.`,
            ]
              .filter(Boolean)
              .join(' '),
          },
        ],
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
    const replies = mixed(readReply(body.content ?? []), board)
    return replies.length ? { status: 'ok', replies } : fail('The suggestion service sent back nothing')
  } catch {
    return fail('Could not reach the suggestion service')
  }
}

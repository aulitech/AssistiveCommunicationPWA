// The answers offered to a question, as cells on the board.
//
// **A suggestion is a phrase or it is nothing.** Everything the board already
// does — drawing a blank as a dashed gap, landing the caret in it, narrowing to
// a typed word, reading the words out to a screen reader — is work `Phrase`
// does, and a suggestion that were its own kind of thing would be that work
// written a second time and then kept in step. So the answers that come back
// are turned into phrases here and handed to the grid like any others.
//
// Three things about them, and each is why this is a module rather than a line
// in the hook:
//
//   * **A gap is a slot with nothing in it**, not the letters `___` drawn on a
//     cell. That is the shape `composeWithBlank` already reports an offset for,
//     so an answer chosen off the board lands with the caret in its gap exactly
//     as a fill-in-the-blank phrase off the grid does.
//   * **They are not a category.** `SUGGEST_FILTER` begins with a space, as
//     `SENT_FILTER` does, and for the same reason: names are trimmed before
//     they are saved, so no category anybody makes can collide with it.
//   * **They are never written down.** Not a backup, not a snapshot, not even
//     `localStorage` — they belong to a question that is on screen, and a board
//     that offered yesterday's answers to today's question would be worse than
//     one that offered none.

import { compose, type Phrase, type Segment } from '../core/phrases'

/** The category its phrases claim, and the word on its tab. */
export const SUGGEST_CATEGORY = 'Answers'

/** The filter id. The leading space keeps it out of reach of a real category. */
export const SUGGEST_FILTER = ' answers'

/**
 * Two or more underscores, which is what the brief asks a gap to be written as.
 *
 * Two rather than exactly three, because a model asked for `___` will sometimes
 * write `__` or `____`, and an answer with visible underscores in it is worse
 * than one whose gap is a character wider than it was asked for. A single
 * underscore is left alone, being a character somebody's name might have in it.
 */
const GAP = /_{2,}/

/**
 * One answer's segments: its words, and a slot with no options wherever it left
 * a gap.
 *
 * A slot with nothing in it is what the rest of the app already calls a blank —
 * `hasChoices` is false for it, so nothing asks which option to use, and
 * `composeWithBlank` writes it as `BLANK` and says where that landed.
 */
function segmentsWithGaps(reply: string): Segment[] {
  const segments: Segment[] = []
  let rest = reply
  for (let gap = GAP.exec(rest); gap; gap = GAP.exec(rest)) {
    if (gap.index > 0) segments.push({ kind: 'text', text: rest.slice(0, gap.index) })
    // Unlabelled, because there is nothing to call it: the board's own blanks
    // are named after the list they came from, and this one is a hole the model
    // left where a fact about somebody would have gone.
    segments.push({ kind: 'slot', label: '', options: [] })
    rest = rest.slice(gap.index + gap[0].length)
  }
  if (rest) segments.push({ kind: 'text', text: rest })
  return segments
}

/**
 * The answers as phrases, in the order they were offered.
 *
 * `nonce` is the question they answer, so a new question draws new cells rather
 * than re-dressing the old ones: the ids reach memoised cells and the mark on
 * the last thing chosen, and both should belong to one question only.
 */
export function suggestionPhrases(replies: string[], nonce: number): Phrase[] {
  return replies.map((reply, i) => {
    const segments = segmentsWithGaps(reply)
    return {
      id: `answer-${nonce}-${i}`,
      // What it reads as, through the same `compose` the board's own phrases
      // go through: a gap is `BLANK`, which is no characters at all, and the
      // dashed underline is drawn from the slot rather than from anything in
      // the text.
      text: compose(segments),
      source: reply,
      segments,
      category: SUGGEST_CATEGORY,
    }
  })
}

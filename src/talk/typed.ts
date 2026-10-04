// **What has been typed**, which the grid searches Library for — one rule for
// the message being composed and the phrase being edited, so the board answers
// typing the same way in every mode.
//
// A phrase put in the box is finished; what somebody types after it is not, and
// the two look the same to anything that reads only the text. So the box keeps
// what it held when a phrase was last put in it — `phrased` — and what is typed
// is what comes after that, up to the caret.

/**
 * What a box held when a phrase was put in it, after the words are changed to
 * `next`. **Typed after, it is untouched; changed anywhere before its end, the
 * phrase is not whole any more** and it ends at the start of the word the change
 * is in — taking the last letter off "moon" and typing it back is typing "moon".
 */
export function keepPhrased(was: string, next: string): string {
  let same = 0
  while (same < was.length && same < next.length && was[same] === next[same]) same++
  if (same === was.length) return was
  return was.slice(0, same - (next.slice(0, same).match(/\S*$/)?.[0].length ?? 0))
}

/** How much of `phrased` the box still holds. */
export function phraseEndIn(text: string, phrased: string): number {
  let same = 0
  while (same < phrased.length && same < text.length && phrased[same] === text[same]) same++
  return same
}

/**
 * Where what is being typed begins, for a caret at `pos`: the end of the last
 * phrase — or, with the caret back inside what came before it, the start of the
 * word it is in, since a caret moved into a phrase's gap is filling a blank one
 * word at a time.
 */
export function typedFrom(text: string, phraseEnd: number, pos: number): number {
  return pos >= phraseEnd ? phraseEnd : pos - (text.slice(0, pos).match(/\S+$/)?.[0].length ?? 0)
}

/** What has been typed since the last phrase, up to the caret. */
export function typedIn(text: string, phrased: string, caret: number): string {
  const pos = Math.min(caret, text.length)
  return text.slice(typedFrom(text, phraseEndIn(text, phrased), pos), pos).trim()
}

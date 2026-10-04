// **", please" on the end of what is said** — the toggle beside paste in the
// message card. Added as the words go out, by `speak`, and never to the phrase.
//
// The word is the board's own "Please" phrase in whatever language the words
// came out in, so a board speaking Spanish says "por favor" and one speaking
// English says "please": the shipped tables already hold it, and a language
// without one asks the translator once and keeps the answer like any other.

/** The words looked up in another language — the board's own phrase. */
export const PLEASE = 'Please'

/** Sentence-ending marks, kept after the please rather than before it. */
const ENDING = /[\s.!?…。！？]*$/u
/** A comma or the like the words already end on, which the please replaces. */
const TRAILING_COMMA = /[\s,،、，;:]+$/u

/**
 * The words with please on the end, before whatever ends the sentence —
 * "I want water." becomes "I want water, please." and "¡Ayúdenme!" becomes
 * "¡Ayúdenme, por favor!". **Words that already say please are left alone**,
 * at either end, so "Please" and "Can you help me, please?" are not said with
 * it twice.
 */
export function withPlease(words: string, please: string): string {
  const word = please.trim().replace(/[.!?。！？]+$/u, '')
  const trimmed = words.trimEnd()
  const ending = ENDING.exec(trimmed)![0]
  const body = trimmed.slice(0, trimmed.length - ending.length).replace(TRAILING_COMMA, '')
  if (!word || !body) return words
  // Mid-sentence, so not capitalised: "Por favor" from the table is "por favor"
  // after a comma. A script without case is untouched by this.
  const said = word.charAt(0).toLocaleLowerCase() + word.slice(1)
  const plain = (s: string) =>
    s
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim()
  const already = plain(said)
  const padded = ` ${plain(body)} `
  if (padded.startsWith(` ${already} `) || padded.endsWith(` ${already} `)) return words
  return `${body}, ${said}${ending}`
}

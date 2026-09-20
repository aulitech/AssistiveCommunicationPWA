import { describe, it, expect } from 'vitest'
import { SUGGEST_CATEGORY, SUGGEST_FILTER, suggestionPhrases } from '../../src/talk/suggestions'
import { composeWithBlank, hasChoices } from '../../src/core/phrases'

// The answers to a question, as cells on the board.
//
// **A suggestion is a phrase or it is nothing.** Everything worth asserting
// here is about that: a gap is the same blank a fill-in-the-blank phrase has,
// so the caret lands in it by the board's own arithmetic rather than by a
// second copy of it written for answers alone.

const only = (reply: string) => suggestionPhrases([reply], 1)[0]

describe('an answer as a phrase', () => {
  it('is filed where its tab looks for it, and nowhere a category could be', () => {
    expect(only('Tea please').category).toBe(SUGGEST_CATEGORY)
    // Names are trimmed before they are saved, so the leading space is what
    // keeps a category anybody makes from ever colliding with this.
    expect(SUGGEST_FILTER.startsWith(' ')).toBe(true)
    expect(SUGGEST_FILTER.trim()).not.toBe(SUGGEST_FILTER)
  })

  it('keeps the answers in the order they were offered', () => {
    expect(suggestionPhrases(['Yes', 'No', 'In a minute'], 1).map(p => p.text)).toEqual([
      'Yes',
      'No',
      'In a minute',
    ])
  })

  /**
   * **A new question draws new cells.** The ids reach memoised cells and the
   * mark on the last thing chosen, and both belong to one question: the same id
   * re-dressed would carry that mark onto an answer to something else.
   */
  it('gives every cell an id of its own, and a new one to a new question', () => {
    const first = suggestionPhrases(['Yes', 'No'], 1).map(p => p.id)
    const next = suggestionPhrases(['Yes', 'No'], 2).map(p => p.id)
    expect(new Set([...first, ...next]).size).toBe(4)
  })
})

/**
 * The gap.
 *
 * What the model may not state about the person it leaves a hole in, and the
 * hole becomes the app's own blank — drawn as a dashed gap on the cell, and
 * landing the caret in itself when the answer is chosen, exactly as a
 * fill-in-the-blank phrase off the grid does.
 */
describe('an answer with a gap in it', () => {
  // A blank is a slot with nothing in it, which is the one thing that both
  // draws a dashed gap and reports where the caret goes.
  it('is a blank slot rather than three underscores drawn on a cell', () => {
    const phrase = only('I took them at ___ this morning')
    expect(phrase.segments.filter(s => s.kind === 'slot')).toHaveLength(1)
    expect(phrase.text, 'the underscores are still in the words').not.toMatch(/_/)
    // Nothing to choose between, so nothing asks which option to use.
    expect(hasChoices(phrase.segments)).toBe(false)
  })

  it('puts the caret where the gap was', () => {
    const { text, blankAt } = composeWithBlank(only('I took them at ___ this morning').segments)
    // `BLANK` is the empty string, so the words either side are spaced as they
    // were written.
    expect(text).toBe('I took them at  this morning')
    expect(blankAt).toBe(15)
  })

  // A model asked for `___` will sometimes write `__` or `________`, and an
  // answer with visible underscores in it is worse than a gap a character wide.
  it('takes a gap however many underscores it came as', () => {
    for (const written of ['__', '___', '________']) {
      const { text, blankAt } = composeWithBlank(only(`I want ${written} please`).segments)
      expect({ written, text, blankAt }).toEqual({ written, text: 'I want  please', blankAt: 7 })
    }
  })

  it('opens out every gap and points at the first', () => {
    const { text, blankAt } = composeWithBlank(only('___ at ___').segments)
    expect(text).toBe(' at ')
    expect(blankAt).toBe(0)
  })

  // A single underscore is a character somebody's name might have in it, and an
  // answer is not a place to go looking for markup nobody asked for.
  it('leaves a lone underscore alone', () => {
    const phrase = only('My handle is spero_k')
    expect(phrase.segments.some(s => s.kind === 'slot')).toBe(false)
    expect(phrase.text).toBe('My handle is spero_k')
  })

  it('says there is no gap where an answer has none', () => {
    expect(composeWithBlank(only('Tea please').segments).blankAt).toBe(-1)
  })
})

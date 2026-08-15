import { describe, it, expect, afterEach } from 'vitest'
import { caretIndexAt, movedAway } from './caret'

// Which character sits under the pointer. jsdom implements neither of the two
// APIs that answer this, so each is stubbed here — what is under test is which
// answer is trusted, and when none is.

function field(value: string): HTMLTextAreaElement {
  const el = document.createElement('textarea')
  el.value = value
  document.body.append(el)
  return el
}

type Api = {
  caretPositionFromPoint?: unknown
  caretRangeFromPoint?: unknown
}

const stub = (api: Api) => Object.assign(document, api)

afterEach(() => {
  const doc = document as unknown as Record<string, unknown>
  delete doc.caretPositionFromPoint
  delete doc.caretRangeFromPoint
  document.body.replaceChildren()
})

describe('finding the character under the pointer', () => {
  it('uses the standard answer, which is a character index into the field', () => {
    const el = field('I am cold')
    stub({ caretPositionFromPoint: () => ({ offsetNode: el, offset: 4 }) })
    expect(caretIndexAt(el, 10, 10)).toBe(4)
  })

  // Null means "leave the caret where it was" rather than "put it at nought",
  // which would silently jump to the front of the phrase on every dwell.
  it('says nothing when the browser has neither answer', () => {
    expect(caretIndexAt(field('I am cold'), 10, 10)).toBeNull()
  })

  it('declines an answer about some other element', () => {
    const el = field('I am cold')
    stub({ caretPositionFromPoint: () => ({ offsetNode: document.body, offset: 2 }) })
    expect(caretIndexAt(el, 10, 10)).toBeNull()
  })

  it('declines an offset past the end of the value', () => {
    const el = field('short')
    stub({ caretPositionFromPoint: () => ({ offsetNode: el, offset: 99 }) })
    expect(caretIndexAt(el, 10, 10)).toBeNull()
  })

  describe('the older answer', () => {
    const range = (offset: number) => ({ caretRangeFromPoint: () => ({ startOffset: offset }) })

    it('is taken while the value is one line', () => {
      const el = field('I am cold')
      stub(range(4))
      expect(caretIndexAt(el, 10, 10)).toBe(4)
    })

    // It answers about the run of text it found, which on a phrase written over
    // several lines is one of them — an offset into line two would read as an
    // offset into the whole value and land the caret nowhere near the pointer.
    it('is declined once the phrase has more than one line', () => {
      const el = field('# Drinks\n- water')
      stub(range(4))
      expect(caretIndexAt(el, 10, 10)).toBeNull()
    })

    it('gives way to the standard answer where both exist', () => {
      const el = field('I am cold')
      stub({ ...range(9), caretPositionFromPoint: () => ({ offsetNode: el, offset: 2 }) })
      expect(caretIndexAt(el, 10, 10)).toBe(2)
    })
  })

  it('survives an API that throws rather than answering', () => {
    const el = field('I am cold')
    stub({
      caretPositionFromPoint: () => {
        throw new Error('no')
      },
    })
    expect(caretIndexAt(el, 10, 10)).toBeNull()
  })
})

// A dwell fires once on arrival, so without a notion of aiming somewhere new
// the caret could only ever be placed by leaving the box and coming back. Gaze
// never holds perfectly still, so the threshold has to sit above the jitter.
describe('aiming somewhere new', () => {
  it('ignores the wobble of a pointer trying to hold still', () => {
    expect(movedAway({ x: 100, y: 100 }, 104, 97)).toBe(false)
  })

  it('notices a move to another part of the phrase', () => {
    expect(movedAway({ x: 100, y: 100 }, 160, 100)).toBe(true)
    expect(movedAway({ x: 100, y: 100 }, 100, 160)).toBe(true)
  })
})

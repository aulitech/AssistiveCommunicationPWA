import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import { useRef } from 'react'
import { caretIndexAt, movedAway, useCaretDwell } from './caret'

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

// The hook the two text boxes share. The app tests drive it through the real
// boxes; what is left for here is the part they cannot see, because jsdom
// reaches the same end by a second route — see `onPlace` below.
describe('the caret dwell', () => {
  function Probe({ value, onPlace, disabled }: {
    value: string
    onPlace?: (index: number) => void
    disabled?: boolean
  }) {
    const ref = useRef<HTMLTextAreaElement>(null)
    const caret = useCaretDwell(ref, 500, { onPlace, disabled })
    return <textarea ref={ref} defaultValue={value} aria-label="probe" {...caret.props} />
  }

  let box: HTMLTextAreaElement
  const show = (props: { onPlace?: (index: number) => void; disabled?: boolean } = {}) => {
    const { container } = render(<Probe value="I am cold" {...props} />)
    box = container.querySelector('textarea')!
  }
  const answers = (offset: number) =>
    Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: box, offset }) })
  const dwell = () => {
    fireEvent.pointerEnter(box, { clientX: 100, clientY: 100 })
    act(() => void vi.advanceTimersByTime(500))
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    delete (document as unknown as Record<string, unknown>).caretPositionFromPoint
  })

  /**
   * The one claim the app tests cannot make. The message box tracks the caret
   * in state, and under jsdom `setSelectionRange` also fires a `selectionchange`
   * that React turns into `onSelect` — which reaches the very same state by the
   * very same setter. So through the app the two paths are indistinguishable,
   * and pulling `onPlace` out changes nothing there.
   *
   * It is worth having anyway: `selectionchange` on a form control is a late
   * addition that older browsers do not fire at all, and a caret whose position
   * is not reported leaves the grid completing a word the caret has left —
   * silently, and looking for all the world like the search is broken.
   */
  it('reports where it put the caret', () => {
    const onPlace = vi.fn()
    show({ onPlace })
    answers(4)
    dwell()
    expect(onPlace).toHaveBeenCalledWith(4)
  })

  // Null is "leave the caret alone", so there is nothing to report either.
  it('reports nothing where the browser will not say', () => {
    const onPlace = vi.fn()
    show({ onPlace })
    dwell()
    expect(onPlace).not.toHaveBeenCalled()
    expect(document.activeElement, 'the box was left unfocusable').toBe(box)
  })

  it('does nothing at all while disabled', () => {
    const onPlace = vi.fn()
    show({ onPlace, disabled: true })
    answers(4)
    dwell()
    expect(onPlace).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(box)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import { useRef } from 'react'
import { caretIndexAt, movedAway, useCaretDwell, wordAt } from '../../src/ui/caret'

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

// What a hold takes before it takes everything. Whitespace is the only
// boundary: in a box holding a contact's name or a word off a list, what
// somebody means to replace is what reads as one thing.
describe('the word around the caret', () => {
  it('takes the word the caret is inside', () => {
    expect(wordAt('tea and coffee', 5)).toEqual([4, 7])
  })

  it('takes the word the caret is at the front of', () => {
    expect(wordAt('tea and coffee', 8)).toEqual([8, 14])
  })

  // There is nothing else a rest just after a word could mean.
  it('takes the word behind a caret that is on a space', () => {
    expect(wordAt('tea and coffee', 3)).toEqual([0, 3])
  })

  // A run of spaces is the gap after a word rather than a word of its own.
  // Without this the hold has a step that selects nothing at all, which reads as
  // the feature simply not working.
  it('takes the word behind a caret inside a run of spaces', () => {
    expect(wordAt('tea  and', 4)).toEqual([0, 3])
  })

  it('takes the last word for a caret past the end', () => {
    expect(wordAt('tea and coffee', 14)).toEqual([8, 14])
  })

  it('takes nothing out of an empty field', () => {
    expect(wordAt('', 0)).toEqual([0, 0])
  })

  // A hyphen and a dot are not boundaries: an address or a double-barrelled
  // name is one thing to replace, not three.
  it('keeps a hyphenated name and an address whole', () => {
    expect(wordAt('mary-jane', 4)).toEqual([0, 9])
    expect(wordAt('write to jo@example.com now', 12)).toEqual([9, 23])
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
  function Probe({
    value,
    onPlace,
    disabled,
  }: {
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

/**
 * Selecting by gaze. A dwell can say one thing — "here" — and a selection is
 * two, so the second is said by keeping still: the caret, then the word around
 * it, then the whole value. No second control, because there is nowhere in a
 * field this size to put one and two targets in one place is the worst thing to
 * hand somebody aiming by gaze.
 */
describe('holding still to select', () => {
  function Probe({ value }: { value: string }) {
    const ref = useRef<HTMLInputElement>(null)
    const caret = useCaretDwell(ref, 500, { selectOnHold: true })
    // The fill is what says another step is coming, so the test can see it stop.
    return (
      <input
        ref={ref}
        className={caret.active ? 'dwelling' : ''}
        defaultValue={value}
        aria-label="probe"
        {...caret.props}
      />
    )
  }

  let box: HTMLInputElement
  const show = (value: string) => {
    const { container } = render(<Probe value={value} />)
    box = container.querySelector('input')!
  }
  const answers = (offset: number) =>
    Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: box, offset }) })
  const rest = () => act(() => void vi.advanceTimersByTime(500))
  const arrive = (x = 100) => {
    fireEvent.pointerEnter(box, { clientX: x, clientY: 100 })
    rest()
  }
  const selection = () => [box.selectionStart, box.selectionEnd]

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    delete (document as unknown as Record<string, unknown>).caretPositionFromPoint
  })

  it('places the caret, then takes the word, then takes everything', () => {
    show('tea and coffee')
    answers(5)

    arrive()
    expect(selection(), 'the first rest is a caret, not a selection').toEqual([5, 5])

    rest()
    expect(selection()).toEqual([4, 7])

    rest()
    expect(selection()).toEqual([0, 14])
  })

  // The bar promises a firing. At the end of the hold there is not one, so it
  // stops rather than filling towards nothing.
  it('stops the fill once there is nothing left to take', () => {
    show('tea and coffee')
    answers(5)
    arrive()
    rest()
    expect(box.className, 'the fill stopped while the word was still to come').toBe('dwelling')

    rest()
    expect(box.className).toBe('')
  })

  // One word is already the whole value, so there is nothing between the word
  // and everything — the hold is over a step early rather than repeating itself.
  it('has nowhere to go past the word in a field holding one', () => {
    show('Mum')
    answers(1)
    arrive()
    rest()

    expect(selection()).toEqual([0, 3])
    expect(box.className, 'a step was still promised with nothing left to take').toBe('')
  })

  // Aiming somewhere new is a caret again, not a continuation: otherwise a
  // second look at a word would select it rather than move the caret there.
  it('starts over as a caret when the pointer aims somewhere else', () => {
    show('tea and coffee')
    answers(5)
    arrive()
    rest()
    expect(selection()).toEqual([4, 7])

    answers(9)
    fireEvent.pointerMove(box, { clientX: 200, clientY: 100 })
    fireEvent.pointerMove(box, { clientX: 260, clientY: 100 })
    rest()

    expect(selection()).toEqual([9, 9])
  })

  // The message box asks for none of this: a pointer parked over the message
  // while its owner reads the board is at rest without meaning anything by it.
  it('does nothing but place the caret without the option', () => {
    function Plain() {
      const ref = useRef<HTMLInputElement>(null)
      const caret = useCaretDwell(ref, 500)
      return <input ref={ref} defaultValue="tea and coffee" aria-label="plain" {...caret.props} />
    }
    const { container } = render(<Plain />)
    box = container.querySelector('input')!
    answers(5)

    arrive()
    rest()
    rest()
    expect(selection()).toEqual([5, 5])
  })
})

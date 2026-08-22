// Typing into whatever field has the caret.
//
// The keyboard is an input *device*: it writes through the DOM the way a real
// keyboard does rather than being wired into each box. What has to hold is that
// React hears it — the failure this guards against is a letter that appears on
// screen and vanishes at the next render, because the change slipped past
// React's own value tracker.

import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { deleteBack, insertText, isTextField, useFocusedField } from '../../src/ui/typing'

/**
 * The state is rendered *beside* the box on purpose.
 *
 * Reading `box().value` back proves nothing: it is the DOM node this module
 * just wrote to. The failure being guarded against is a letter that reaches the
 * node and never reaches React — visible, and gone at the next render, with the
 * app still holding the old text. So every assertion below is against what
 * React thinks the value is.
 */
function Controlled({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <textarea aria-label="box" value={value} onChange={e => setValue(e.target.value)} />
      <span data-testid="state">{value}</span>
    </>
  )
}

const box = () => screen.getByLabelText<HTMLTextAreaElement>('box')
/** What React holds — the only reading that means anything here. */
const held = () => screen.getByTestId('state').textContent

const type = (field: HTMLTextAreaElement, text: string) => act(() => insertText(field, text))
const back = (field: HTMLTextAreaElement) => {
  let removed = false
  act(() => void (removed = deleteBack(field)))
  return removed
}

describe('what counts as somewhere to type', () => {
  it('takes a textarea and a text input', () => {
    render(
      <>
        <textarea aria-label="area" />
        <input aria-label="text" type="text" />
        <input aria-label="plain" />
      </>,
    )
    expect(isTextField(screen.getByLabelText('area'))).toBe(true)
    expect(isTextField(screen.getByLabelText('text'))).toBe(true)
    expect(isTextField(screen.getByLabelText('plain'))).toBe(true)
  })

  it('refuses an input that holds no words', () => {
    render(<input aria-label="check" type="checkbox" />)
    expect(isTextField(screen.getByLabelText('check'))).toBe(false)
  })

  // A read-only box is one the app is deliberately not letting anybody edit.
  it('refuses a box that cannot be written in', () => {
    render(
      <>
        <textarea aria-label="ro" readOnly />
        <textarea aria-label="off" disabled />
      </>,
    )
    expect(isTextField(screen.getByLabelText('ro'))).toBe(false)
    expect(isTextField(screen.getByLabelText('off'))).toBe(false)
  })

  it('refuses everything that is not a field at all', () => {
    expect(isTextField(null)).toBe(false)
    expect(isTextField(document.body)).toBe(false)
  })
})

/**
 * The one that matters. React remembers the last value it wrote on the node,
 * and an assignment to `field.value` slips past that: the `input` event fires,
 * React finds no change against what it believes is there, and drops it. The
 * letter shows and then disappears at the next render.
 */
describe('a letter reaching React', () => {
  it('lands in a controlled box and stays there', () => {
    render(<Controlled />)
    type(box(), 'h')
    expect(held(), 'the change never reached React').toBe('h')

    type(box(), 'i')
    expect(held()).toBe('hi')
  })

  it('goes in at the caret rather than at the end', () => {
    render(<Controlled initial="ac" />)
    box().setSelectionRange(1, 1)
    type(box(), 'b')
    expect(held()).toBe('abc')
  })

  it('leaves the caret after what was typed', () => {
    render(<Controlled initial="ac" />)
    box().setSelectionRange(1, 1)
    type(box(), 'xy')
    expect(box().selectionStart).toBe(3)
  })

  /**
   * A hold over a field selects the word under it — see `useCaretDwell` — so
   * typing over a selection has to replace it, exactly as a real keyboard does.
   * It is the only way a dwell user rewords anything.
   */
  it('replaces whatever is selected', () => {
    render(<Controlled initial="the red one" />)
    box().setSelectionRange(4, 7)
    type(box(), 'blue')
    expect(held()).toBe('the blue one')
  })
})

describe('backspace', () => {
  it('takes the character before the caret', () => {
    render(<Controlled initial="hit" />)
    box().setSelectionRange(3, 3)
    expect(back(box())).toBe(true)
    expect(held()).toBe('hi')
  })

  it('takes from the middle, not the end', () => {
    render(<Controlled initial="abc" />)
    box().setSelectionRange(2, 2)
    back(box())
    expect(held()).toBe('ac')
    expect(box().selectionStart).toBe(1)
  })

  it('takes the whole selection in one go', () => {
    render(<Controlled initial="the red one" />)
    box().setSelectionRange(4, 8)
    back(box())
    expect(held()).toBe('the one')
  })

  /**
   * Backspace repeats while it is held. Answering that it removed nothing is
   * what lets the repeat stop at the start of the value instead of firing on
   * against an empty box for as long as somebody rests there.
   */
  it('says when there was nothing left to take', () => {
    render(<Controlled initial="" />)
    box().setSelectionRange(0, 0)
    expect(back(box())).toBe(false)
    expect(held()).toBe('')
  })
})

function Probe() {
  const fieldOf = useFocusedField()
  const [seen, setSeen] = useState('—')
  const [gone, setGone] = useState(false)
  return (
    <>
      {!gone && <textarea aria-label="one" />}
      <textarea aria-label="two" />
      <button onClick={() => setSeen(fieldOf()?.getAttribute('aria-label') ?? 'none')}>ask</button>
      <button onClick={() => setGone(true)}>close</button>
      <span data-testid="seen">{seen}</span>
    </>
  )
}

const ask = () => {
  fireEvent.click(screen.getByText('ask'))
  return screen.getByTestId('seen').textContent
}

describe('which field to type into', () => {
  it('is the focused one', () => {
    render(<Probe />)
    act(() => screen.getByLabelText<HTMLTextAreaElement>('two').focus())
    expect(ask()).toBe('two')
  })

  /**
   * A key is a dwell control and a dwell control is focusable, so anything that
   * moves the focus off the field — a tap, a switch, a stray Tab — would leave
   * the next letter with nowhere to go. The last field that had it stands in.
   */
  it('is the last one that was, once focus has moved away', () => {
    render(<Probe />)
    act(() => screen.getByLabelText<HTMLTextAreaElement>('one').focus())
    act(() => (document.activeElement as HTMLElement)?.blur())
    expect(ask()).toBe('one')
  })

  it('is nothing at all before anything has been focused', () => {
    render(<Probe />)
    expect(ask()).toBe('none')
  })

  /**
   * A panel closing behind the keyboard takes its fields with it, and a
   * detached node is not somewhere to put a letter. The same probe throughout,
   * or the fresh hook would answer "none" whatever the code did.
   */
  it('forgets a field that has left the page', () => {
    render(<Probe />)
    act(() => screen.getByLabelText<HTMLTextAreaElement>('one').focus())
    expect(ask()).toBe('one')

    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByLabelText('one')).toBeNull()
    expect(ask(), 'a letter was about to go into a box that is not on the page').toBe('none')
  })
})

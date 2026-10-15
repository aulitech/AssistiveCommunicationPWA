// **A link in the message box, edited as its text and where it goes** — two
// fields under the line for each link the box holds, written back into the box
// as they are typed. See `talk/link-fields.tsx`.

import { describe, it, expect } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { $, $$, box, click, editToggle, renderApp, settle, writeIn } from './harness'

const rows = () => $$('.link-row')
const field = (row: number, name: 'Link text' | 'Link address') =>
  rows()[row].querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
/** Typed into one of the fields, focus and all, as a person types. */
const typeIn = (input: HTMLInputElement, value: string) => {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  settle()
}

describe('the fields for a link in the message box', () => {
  it('are not there while the box holds no link', () => {
    renderApp()
    writeIn(box(), 'Nothing to follow here')
    expect($('.link-fields')).toBeNull()
  })

  it('come up for an address written out, with no text yet', () => {
    renderApp()
    writeIn(box(), 'Look at https://example.com/menu please')
    expect(rows()).toHaveLength(1)
    expect(field(0, 'Link text').value).toBe('')
    expect(field(0, 'Link address').value).toBe('https://example.com/menu')
  })

  it('give an address its text, as a link in the box', () => {
    renderApp()
    writeIn(box(), 'Look at https://example.com/menu please')
    typeIn(field(0, 'Link text'), "Today's menu")
    expect(box().value).toBe("Look at [Today's menu](https://example.com/menu) please")
  })

  it('change where a link goes and leave what it says', () => {
    renderApp()
    writeIn(box(), 'See [the menu](https://a.com) now')
    expect(field(0, 'Link text').value).toBe('the menu')
    typeIn(field(0, 'Link address'), 'https://b.com')
    expect(box().value).toBe('See [the menu](https://b.com) now')
  })

  // An address emptied to be typed again is, for a moment, not a link at all —
  // and the field being typed in must not go from under it.
  it('stay while an address is emptied and typed again', () => {
    renderApp()
    writeIn(box(), 'See [the menu](https://a.com) now')
    typeIn(field(0, 'Link address'), '')
    expect(box().value).toBe('See the menu now')
    expect(rows(), 'the fields went with the address').toHaveLength(1)
    typeIn(field(0, 'Link address'), 'https://c.com')
    expect(box().value).toBe('See [the menu](https://c.com) now')
  })

  it('give each link a row of its own, in order', () => {
    renderApp()
    writeIn(box(), '[One](https://one.com) and https://two.com')
    expect(rows().map((_, i) => field(i, 'Link address').value)).toEqual(['https://one.com', 'https://two.com'])
    typeIn(field(1, 'Link text'), 'Two')
    expect(box().value).toBe('[One](https://one.com) and [Two](https://two.com)')
  })

  it('edit the phrase being written in edit mode', () => {
    renderApp()
    click(editToggle())
    writeIn(box(), 'Our [club](https://club.org)')
    typeIn(field(0, 'Link text'), 'running club')
    expect(box().value).toBe('Our [running club](https://club.org)')
  })
})

import { describe, it, expect } from 'vitest'
import { addSent, loadSent, saveSent, type SentMessage } from './store'

// The list of what was said. Driven through the app in App.test.tsx; this is the
// arithmetic underneath, including the parts the buttons cannot reach because
// they are disabled when there is nothing to send.

const texts = (messages: SentMessage[]) => messages.map(m => m.text)
const listOf = (...values: string[]) => values.reduce<SentMessage[]>((list, v) => addSent(list, v), [])

describe('adding to the list', () => {
  it('puts the newest first', () => {
    expect(texts(listOf('one', 'two', 'three'))).toEqual(['three', 'two', 'one'])
  })

  it('gives every message an id of its own', () => {
    const list = listOf('one', 'two')
    expect(new Set(list.map(m => m.id)).size).toBe(2)
  })

  // The list is for reaching a sentence again, and ten copies of "yes please"
  // makes that harder, not easier.
  it('moves a repeat to the top rather than listing it twice', () => {
    expect(texts(listOf('one', 'two', 'one'))).toEqual(['one', 'two'])
  })

  it('keeps the same id when a message comes back', () => {
    const once = listOf('one', 'two')
    const again = addSent(once, 'one')
    expect(again[0].id).toBe(once[1].id)
  })

  it('ignores an empty message, and trims the rest', () => {
    expect(texts(listOf('', '   ', '\n'))).toEqual([])
    expect(texts(listOf('  hello  '))).toEqual(['hello'])
    // Trimmed on the way in, so the same words with a stray space are one entry.
    expect(texts(listOf('hello', ' hello '))).toEqual(['hello'])
  })

  // A day of talking would otherwise fill the browser's storage and put a
  // thousand cells in the grid.
  it('keeps the last two hundred and drops the rest', () => {
    let list: SentMessage[] = []
    for (let i = 0; i < 260; i++) list = addSent(list, `message ${i}`)

    expect(list).toHaveLength(200)
    expect(list[0].text).toBe('message 259')
    expect(texts(list)).not.toContain('message 0')
  })
})

describe('reading it back', () => {
  it('survives a round trip', () => {
    const list = listOf('one', 'two')
    saveSent(list)
    expect(loadSent()).toEqual(list)
  })

  it('starts empty rather than throwing on nonsense', () => {
    for (const stored of ['', 'not json', '{}', 'null', '[1, 2]']) {
      localStorage.setItem('peri_sent', stored)
      expect(loadSent()).toEqual([])
    }
  })

  it('keeps the entries it can read out of a damaged list', () => {
    localStorage.setItem('peri_sent', JSON.stringify([{ id: 'a', text: 'kept' }, { id: 'b' }, 'nonsense', null]))
    expect(loadSent()).toEqual([{ id: 'a', text: 'kept' }])
  })

  // A list written by a build with a higher limit does not get to make the grid
  // longer than this one allows.
  it('holds a stored list to the same limit', () => {
    const long = Array.from({ length: 300 }, (_, i) => ({ id: `s${i}`, text: `message ${i}` }))
    localStorage.setItem('peri_sent', JSON.stringify(long))
    expect(loadSent()).toHaveLength(200)
  })
})

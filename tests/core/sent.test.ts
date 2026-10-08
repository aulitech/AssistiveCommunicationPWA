import { describe, it, expect } from 'vitest'
import { plainPhrase } from '../../src/core/phrases'
import { buildPhrase, keepingSaid } from '../../src/core/board'
import { emptyStore, forgetSent, loadSent } from '../../src/core/store'

// What was said, kept in Library. Driven through the app in
// app/message.test.tsx; this is the rule underneath, and the list a board from
// before kept, which is read once to bring it in.

const TABLE = [plainPhrase('s1', 'Hello', 'Library'), plainPhrase('s2', 'Yes please', 'Library')]
const said = (...texts: string[]) => texts.map((text, i) => ({ id: `custom-${i}`, text }))

describe('keeping what was said', () => {
  it('adds each message to Library as a phrase in no category', () => {
    const store = { ...emptyStore(), members: { Food: ['s1'] } }
    const kept = keepingSaid(TABLE, store, said('I am cold', 'Where is Sam'))
    expect(kept.custom).toEqual([
      { id: 'custom-0', text: 'I am cold', category: 'Library' },
      { id: 'custom-1', text: 'Where is Sam', category: 'Library' },
    ])
    expect(kept.members).toEqual({ Food: ['s1'] })
  })

  // Library holds each wording once, and "yes please" said a hundred times is
  // one phrase that gets used a hundred times.
  it('leaves out what Library says already, whatever the case and the spaces', () => {
    const store = { ...emptyStore(), custom: [{ id: 'custom-mine', text: 'I am cold', category: 'Library' }] }
    expect(keepingSaid(TABLE, store, said('  yes   PLEASE ', 'i am cold'))).toBe(store)
  })

  it('keeps a message said twice in the one list once', () => {
    expect(keepingSaid(TABLE, emptyStore(), said('Again', 'again')).custom.map(p => p.text)).toEqual(['Again'])
  })

  it('trims a message, and leaves out one that is only spaces', () => {
    expect(keepingSaid(TABLE, emptyStore(), said('  Hi there ', '   ', '')).custom.map(p => p.text)).toEqual([
      'Hi there',
    ])
  })

  // Somebody deleted it, and then said it: that is a phrase they are using.
  it('keeps what matches only a phrase somebody deleted, or reworded away', () => {
    const store = { ...emptyStore(), hidden: ['s1'], overrides: { s2: 'Yes thanks' } }
    expect(keepingSaid(TABLE, store, said('Hello', 'Yes please')).custom.map(p => p.text)).toEqual([
      'Hello',
      'Yes please',
    ])
  })

  // A phrase with its choices made is a repeat of the phrase it came from.
  it('leaves out a phrase with its choices made, and keeps what says more', () => {
    const table = [...TABLE, buildPhrase('s3', "I want the {['red', 'blue']} one", 'Library')]
    const kept = keepingSaid(table, emptyStore(), said('I want the blue one', 'I want the blue one too'))
    expect(kept.custom.map(p => p.text)).toEqual(['I want the blue one too'])
  })

  it('is not fooled by a phrase on the emergency bar, which is not in Library', () => {
    const store = { ...emptyStore(), custom: [{ id: 'custom-help', text: 'Help me', category: 'Emergency' }] }
    expect(keepingSaid(TABLE, store, said('Help me')).custom.map(p => p.text)).toEqual(['Help me', 'Help me'])
  })

  it('takes a reworded phrase as saying what it says now', () => {
    const store = { ...emptyStore(), overrides: { s1: 'Hello there' } }
    expect(keepingSaid(TABLE, store, said('hello there'))).toBe(store)
  })
})

describe('the list a board from before kept', () => {
  it('reads back what was written, newest first', () => {
    localStorage.setItem(
      'peri_sent',
      JSON.stringify([
        { id: 'b', text: 'second' },
        { id: 'a', text: 'first' },
      ]),
    )
    expect(loadSent()).toEqual([
      { id: 'b', text: 'second' },
      { id: 'a', text: 'first' },
    ])
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

  it('is taken away once Library holds it', () => {
    localStorage.setItem('peri_sent', JSON.stringify([{ id: 'a', text: 'kept' }]))
    forgetSent()
    expect(localStorage.getItem('peri_sent')).toBeNull()
  })
})

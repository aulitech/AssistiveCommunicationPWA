import { describe, it, expect, beforeEach } from 'vitest'
import { addTranslated, loadTranslated, saveTranslated, type Translated } from '../../src/core/store'

// What was said in another language. The Sent list's twin, and this is the
// arithmetic underneath it — driven through the real board in
// `app/translations.test.tsx`.
//
// One thing separates the two, and every test about the key is about it: an
// entry belongs to a **language as well as to a phrase**, so the same words said
// in two languages are two entries and the same words said twice in one are not.

const said = (list: Translated[]) => list.map(t => `${t.tag}: ${t.source} → ${t.text}`)

const listOf = (...entries: [string, string, string][]) =>
  entries.reduce<Translated[]>((list, [source, text, tag]) => addTranslated(list, source, text, tag), [])

describe('adding to the record', () => {
  it('puts the newest first, which is the only order this tab has', () => {
    const list = listOf(['I am cold', 'Tengo frío', 'es'], ['Help me', 'Ayúdame', 'es'])
    expect(said(list)).toEqual(['es: Help me → Ayúdame', 'es: I am cold → Tengo frío'])
  })

  it('gives every entry an id of its own', () => {
    const list = listOf(['one', 'uno', 'es'], ['two', 'dos', 'es'])
    expect(new Set(list.map(t => t.id)).size).toBe(2)
  })

  // The tab is for reaching a sentence again, and ten copies makes that harder.
  it('moves a repeat to the top rather than listing it twice', () => {
    const list = listOf(['one', 'uno', 'es'], ['two', 'dos', 'es'], ['one', 'uno', 'es'])
    expect(said(list)).toEqual(['es: one → uno', 'es: two → dos'])
  })

  it('keeps the same id when a phrase is said again', () => {
    const once = listOf(['one', 'uno', 'es'], ['two', 'dos', 'es'])
    const again = addTranslated(once, 'one', 'uno', 'es')
    expect(again[0].id).toBe(once[1].id)
  })

  /**
   * The whole reason the language is part of the key. A board set to Spanish in
   * the morning and French in the afternoon has said the same sentence twice,
   * and both are worth reaching again.
   */
  it('keeps the same phrase in two languages apart', () => {
    const list = listOf(['I am cold', 'Tengo frío', 'es'], ['I am cold', "J'ai froid", 'fr'])
    expect(said(list)).toEqual(["fr: I am cold → J'ai froid", 'es: I am cold → Tengo frío'])
  })

  // A variety is its own language here: `es-PR` reads the Latin American table
  // and is spoken as `es-PR`, and neither is what plain `es` does.
  it('keeps a variety apart from its base language', () => {
    const list = listOf(['I am cold', 'Tengo frío', 'es'], ['I am cold', 'Tengo frío', 'es-PR'])
    expect(list).toHaveLength(2)
  })

  // The service can answer differently for the same words — a better model, or
  // a shipped table arriving in a release that had none. The newer wording is
  // what was actually said, so it is what the record holds.
  it('takes the newer wording for a phrase it already has', () => {
    const list = listOf(['I am cold', 'Tengo frio', 'es'], ['I am cold', 'Tengo frío', 'es'])
    expect(said(list)).toEqual(['es: I am cold → Tengo frío'])
  })

  it('does not change the list it was given', () => {
    const once = listOf(['one', 'uno', 'es'])
    addTranslated(once, 'two', 'dos', 'es')
    expect(once).toHaveLength(1)
  })

  it('trims what came back', () => {
    expect(addTranslated([], 'one', '  uno  ', 'es')[0].text).toBe('uno')
  })

  /** Neither is a thing that can be drawn on a cell or spoken as anything. */
  it('refuses an entry with no words, and one with no language', () => {
    expect(addTranslated([], 'one', '   ', 'es')).toEqual([])
    expect(addTranslated([], 'one', 'uno', '')).toEqual([])
  })

  it('keeps the newest two hundred', () => {
    let list: Translated[] = []
    for (let i = 0; i < 260; i++) list = addTranslated(list, `p${i}`, `t${i}`, 'es')
    expect(list).toHaveLength(200)
    expect(list[0].source).toBe('p259')
    expect(list.at(-1)?.source).toBe('p60')
  })
})

describe('reading the record back', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips what was written', () => {
    const list = listOf(['I am cold', 'Tengo frío', 'es-PR'], ['Help me', 'Ayúdame', 'es'])
    saveTranslated(list)
    expect(loadTranslated()).toEqual(list)
  })

  it('is empty before anything has been said', () => {
    expect(loadTranslated()).toEqual([])
  })

  it('reads nothing out of damage', () => {
    for (const raw of ['not json', '{}', 'null', '7', '"es"']) {
      localStorage.setItem('peri_translated', raw)
      expect(loadTranslated(), raw).toEqual([])
    }
  })

  /**
   * Every field is checked rather than trusted. An entry with no language is one
   * that cannot be spoken as anything, and an entry with no words is a cell
   * nobody can read or reach — so both are dropped rather than drawn.
   */
  it('drops the entries it cannot use and keeps the rest', () => {
    localStorage.setItem(
      'peri_translated',
      JSON.stringify([
        { id: 'a', source: 'one', text: 'uno', tag: 'es' },
        { id: 'b', source: 'two', text: 'dos' },
        { id: 'c', source: 'three', text: '  ', tag: 'es' },
        { id: 'd', source: 'four', text: 'cuatro', tag: '' },
        { id: 'e', text: 'cinco', tag: 'es' },
        'not an entry',
        null,
        7,
      ]),
    )
    expect(loadTranslated().map(t => t.id)).toEqual(['a'])
  })

  it('gives an entry written without one an id', () => {
    localStorage.setItem('peri_translated', JSON.stringify([{ source: 'one', text: 'uno', tag: 'es' }]))
    expect(loadTranslated()[0].id).toBe('es one')
  })

  it('keeps only the newest two hundred out of a longer file', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `i${i}`,
      source: `p${i}`,
      text: `t${i}`,
      tag: 'es',
    }))
    localStorage.setItem('peri_translated', JSON.stringify(many))
    expect(loadTranslated()).toHaveLength(200)
    expect(loadTranslated()[0].id).toBe('i0')
  })
})

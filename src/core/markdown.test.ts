import { describe, it, expect } from 'vitest'
import { hasMarkdown, layout, stripMarkdown, type Line } from './markdown'
import { parseSegments, type Segment } from './phrases'

// What a phrase's markup means. The two things built on it — what the cell draws
// and what gets spoken or searched — walk the same parse, so the tests below
// mostly check that the two never come apart.

const text = (t: string): Segment[] => [{ kind: 'text', text: t }]
/** The styled runs of a one-line phrase, as [text, styles] pairs. */
const runs = (source: string) =>
  layout(text(source))[0].pieces.map(p =>
    p.kind === 'slot'
      ? ['{slot}', 'slot']
      : [p.text, [p.strong && 'strong', p.em && 'em', p.strike && 'strike', p.code && 'code'].filter(Boolean).join('+')],
  )
const kinds = (lines: Line[]) => lines.map(l => (l.kind === 'heading' ? `h${l.level}` : l.kind))

describe('emphasis', () => {
  it('reads bold, italic, strikethrough and code', () => {
    expect(runs('**Help** me')).toEqual([['Help', 'strong'], [' me', '']])
    expect(runs('I am *really* tired')).toEqual([['I am ', ''], ['really', 'em'], [' tired', '']])
    expect(runs('~~Not~~ hungry')).toEqual([['Not', 'strike'], [' hungry', '']])
    expect(runs('press `OK`')).toEqual([['press ', ''], ['OK', 'code']])
  })

  it('nests one inside another', () => {
    expect(runs('**very *very* bad**')).toEqual([
      ['very ', 'strong'],
      ['very', 'strong+em'],
      [' bad', 'strong'],
    ])
  })

  it('reads three asterisks as both at once, rather than as a stray one', () => {
    expect(runs('***now***')).toEqual([['now', 'strong+em']])
  })

  it('leaves what is inside code alone', () => {
    expect(runs('`**not bold**`')).toEqual([['**not bold**', 'code']])
  })

  // An asterisk somebody typed is an asterisk. Nothing is markup until it
  // closes, or a phrase would lose characters as it was being written.
  it('leaves an opener with nothing closing it as text', () => {
    expect(runs('2 * 3 = 6')).toEqual([['2 * 3 = 6', '']])
    expect(runs('**unfinished')).toEqual([['**unfinished', '']])
    expect(runs('a `backtick')).toEqual([['a `backtick', '']])
  })

  // A marker that closes immediately wraps nothing at all. Read as a pair it
  // would delete itself and leave an empty run behind; these have to survive as
  // the characters they are. `****` is here for company rather than for proof —
  // the three-asterisk branch is tried first and fails on its own, so it never
  // reaches the guard that the other two do.
  it('leaves an empty pair alone rather than reading it as nothing', () => {
    expect(runs('~~~~')).toEqual([['~~~~', '']])
    expect(runs('``')).toEqual([['``', '']])
    expect(runs('****')).toEqual([['****', '']])
  })

  it('reads underscores as emphasis too', () => {
    expect(runs('_really_ tired')).toEqual([['really', 'em'], [' tired', '']])
    expect(runs('__Help__ me')).toEqual([['Help', 'strong'], [' me', '']])
    expect(runs('___now___')).toEqual([['now', 'strong+em']])
  })

  // The rule every markdown supporting both delimiters settles on, and the
  // reason underscores need it and asterisks do not: people write `file_name`
  // and `snake_case` without meaning anything by it, and nobody writes
  // `snake*case` by accident.
  it('leaves an underscore inside a word alone', () => {
    expect(runs('snake_case_name')).toEqual([['snake_case_name', '']])
    expect(runs('the file_name field')).toEqual([['the file_name field', '']])
  })

  // Opening between words is not enough on its own — the closing run has to be
  // between words as well, or `_a_b_` would emphasise "a" and leave "b_"
  // hanging off the end of it.
  it('closes on a run between words rather than the first one it meets', () => {
    expect(runs('_a_b_')).toEqual([['a_b', 'em']])
  })
})

describe('line structure', () => {
  it('reads headings and bullets', () => {
    expect(kinds(layout(text('# Drinks\n- water\n- juice')))).toEqual(['h1', 'item', 'item'])
    expect(kinds(layout(text('## Two\n### Three')))).toEqual(['h2', 'h3'])
  })

  it('takes the marker off the line it names', () => {
    const [heading, item] = layout(text('# Drinks\n- water'))
    expect(heading.pieces).toEqual([{ kind: 'text', text: 'Drinks' }])
    expect(item.pieces).toEqual([{ kind: 'text', text: 'water' }])
  })

  it('takes a bullet from an asterisk too, which a space tells from emphasis', () => {
    expect(kinds(layout(text('* water')))).toEqual(['item'])
    expect(kinds(layout(text('*water*')))).toEqual(['para'])
  })

  it('styles what is left on the line', () => {
    const [line] = layout(text('# **Drinks**'))
    expect(line.pieces).toEqual([{ kind: 'text', text: 'Drinks', strong: true }])
  })

  // A hyphen mid-sentence is a hyphen, and four hashes is not a heading Peri
  // has anywhere to draw.
  it('only reads a marker where a line starts', () => {
    expect(kinds(layout(text('well - maybe')))).toEqual(['para'])
    expect(runs('well - maybe')).toEqual([['well - maybe', '']])
    expect(kinds(layout(text('#### Deep')))).toEqual(['para'])
  })

  // The line above cannot show this on its own: with one piece on the line, the
  // first piece and every piece are the same thing. A slot ahead of the hyphen
  // is what tells "the start of the line" from "the start of a run of text".
  it('does not read a marker that only starts a later piece of the line', () => {
    const lines = layout(parseSegments("{['red', 'blue']} - or another"))
    expect(kinds(lines)).toEqual(['para'])
    expect(lines[0].pieces.filter(p => p.kind === 'text')).toEqual([
      { kind: 'text', text: ' - or another' },
    ])
  })
})

describe('markup and slots together', () => {
  const slotted = parseSegments("I want the **{['red', 'blue']}** one")

  it('keeps the slot as a slot, with its options intact', () => {
    const [line] = layout(slotted)
    const slot = line.pieces.find(p => p.kind === 'slot')
    expect(slot).toBeDefined()
    if (slot?.kind === 'slot') expect(slot.slot.options).toEqual(['red', 'blue'])
  })

  // Slots are parsed out before any of this runs, so a pair of markers either
  // side of one never meets. Documented rather than fixed: the shipped table has
  // slots and no markdown, and a phrase somebody writes has the reverse.
  it('does not carry emphasis across a slot', () => {
    const [line] = layout(slotted)
    const strong = line.pieces.filter(p => p.kind === 'text' && p.strong)
    expect(strong).toEqual([])
  })

  it('still draws a phrase that is nothing but a slot', () => {
    const lines = layout(parseSegments('{pronouns}'))
    expect(lines).toHaveLength(1)
    expect(lines[0].pieces.every(p => p.kind === 'slot')).toBe(true)
  })
})

describe('taking the markup back off', () => {
  it('leaves the words, and only the words', () => {
    expect(stripMarkdown('**Help** me')).toBe('Help me')
    expect(stripMarkdown('# Drinks\n- water\n- juice')).toBe('Drinks\nwater\njuice')
    expect(stripMarkdown('press `OK` ~~now~~')).toBe('press OK now')
  })

  // The whole point: what a search matches and what the ear hears have to be
  // what the eye sees. If these two ever disagree, a phrase becomes unfindable
  // or gets spoken wrong.
  it('says exactly what the cell draws', () => {
    for (const source of [
      '**Help** me',
      '***now***',
      '# Drinks\n- water\n- juice',
      'press `OK`',
      '2 * 3 = 6',
      '_really_ tired',
      'snake_case_name',
      '_a_b_',
    ]) {
      const drawn = layout(text(source))
        .map(line => line.pieces.map(p => (p.kind === 'text' ? p.text : '')).join(''))
        .join('\n')
      expect(stripMarkdown(source), `"${source}" reads differently than it draws`).toBe(drawn.trim())
    }
  })

  it('hands back a phrase with nothing in it unchanged', () => {
    const plain = 'I would like a cup of tea'
    expect(stripMarkdown(plain)).toBe(plain)
    expect(hasMarkdown(plain)).toBe(false)
  })
})

// The board is two and a half thousand phrases and search re-scores all of them
// on every keystroke, so the answer for a phrase with no markup has to be cheap
// rather than merely correct.
describe('the cost of asking', () => {
  it('gives up immediately on text with no markers in it', () => {
    expect(hasMarkdown('I would like a cup of tea')).toBe(false)
    expect(hasMarkdown('well-being, 50% off')).toBe(false)
    expect(hasMarkdown('**Help**')).toBe(true)
    expect(hasMarkdown('- water')).toBe(true)
  })
})

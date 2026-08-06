import { describe, it, expect } from 'vitest'
import { BLANK, PHRASES, choosableSlots, compose, hasChoices, makePhrase, parseSegments, plainPhrase } from './phrases'

const slots = (raw: string) => parseSegments(raw).filter(s => s.kind === 'slot')
const optionsOf = (raw: string) => slots(raw).map(s => (s.kind === 'slot' ? s.options : []))
const display = (raw: string) => compose(parseSegments(raw))

describe('parseSegments', () => {
  it('leaves ordinary text alone', () => {
    expect(parseSegments('I am hungry')).toEqual([{ kind: 'text', text: 'I am hungry' }])
  })

  it('reads an inline choice list', () => {
    expect(optionsOf("I want the {['red', 'blue']} one")).toEqual([['red', 'blue']])
  })

  it('tolerates the whitespace variants in the table', () => {
    expect(optionsOf("a { ['x', 'y'] } b")).toEqual([['x', 'y']])
    expect(optionsOf("a {[ 'x', 'y']} b")).toEqual([['x', 'y']])
  })

  // The source table contains hand-written entries that never parsed as JSON.
  it('recovers malformed lists', () => {
    expect(optionsOf("Can you read me a { 'book', 'magazine']}?")).toEqual([['book', 'magazine']])
    expect(optionsOf("May I have something to { 'drink', 'eat'])?")).toEqual([['drink', 'eat']])
  })

  it('resolves an alias list', () => {
    const [pronouns] = optionsOf('Do you like {pronouns}?')
    expect(pronouns).toContain('he')
    expect(pronouns).toContain('they')
  })

  it('matches a singular reference against the plural alias key', () => {
    const [directions] = optionsOf('Please move the bed {direction}')
    expect(directions).toContain('left')
    expect(directions).toContain('clockwise')
  })

  it('handles several slots in one phrase', () => {
    expect(optionsOf("Please turn {control} the {['music', 'tv']}")).toEqual([
      ['on', 'off', 'up', 'down'],
      ['music', 'tv'],
    ])
  })

  it('treats an alias with no data as a blank', () => {
    // `contacts` and `name` exist in the table but ship empty.
    expect(optionsOf('I am going to call {contact}')).toEqual([[]])
    expect(display('This is {name.nickname}')).toBe(`This is ${BLANK}`)
  })

  it('treats an empty placeholder as a blank', () => {
    expect(display('Did you see {}')).toBe(`Did you see ${BLANK}`)
  })
})

describe('compose', () => {
  it('substitutes chosen values by slot position', () => {
    const segments = parseSegments("Please turn {control} the {['music', 'tv']}")
    expect(compose(segments, ['off', 'tv'])).toBe('Please turn off the tv')
  })

  it('falls back to the slot label when nothing is chosen', () => {
    expect(display("I want the {['red', 'blue']} one")).toBe('I want the red/blue one')
  })

  it('keeps unfilled blanks so the user can type over them', () => {
    const segments = parseSegments('Take me to {}')
    expect(compose(segments, [null])).toBe(`Take me to ${BLANK}`)
  })

  it('does not leave a space before punctuation', () => {
    const segments = parseSegments("Can I have my {['socks', 'shoes']}?")
    expect(compose(segments, ['socks'])).toBe('Can I have my socks?')
  })
})

describe('slot helpers', () => {
  it('counts only slots the user can choose from', () => {
    const segments = parseSegments("Call {contact} about the {['bill', 'rent']}")
    expect(choosableSlots(segments)).toHaveLength(1)
    expect(hasChoices(segments)).toBe(true)
  })

  it('reports no choices for a phrase whose only slot is a blank', () => {
    expect(hasChoices(parseSegments('Did you see {}'))).toBe(false)
  })
})

describe('ids', () => {
  it('derives from content, not position', () => {
    // Regression guard: index-based ids reattached saved edits to a neighbouring
    // phrase whenever phrasetable.json changed.
    const first = makePhrase('I am cold', 'Feelings')
    const again = makePhrase('I am cold', 'Feelings')
    expect(first.id).toBe(again.id)
    expect(makePhrase('I am cold', 'Physical Needs').id).not.toBe(first.id)
  })

  it('disambiguates a phrase repeated within one category', () => {
    const seen = new Map<string, number>()
    const a = makePhrase('Thanks', 'Appreciation', seen)
    const b = makePhrase('Thanks', 'Appreciation', seen)
    expect(a.id).not.toBe(b.id)
  })
})

describe('the shipped phrase table', () => {
  it('is not empty', () => {
    expect(PHRASES.length).toBeGreaterThan(2000)
  })

  // The bug this whole module exists to fix: 46 cells rendered raw braces.
  it('renders no placeholder syntax anywhere', () => {
    const leaked = PHRASES.filter(p => /[{}]/.test(p.text))
    expect(leaked.map(p => p.text)).toEqual([])
  })

  it('gives every phrase a unique id', () => {
    expect(new Set(PHRASES.map(p => p.id)).size).toBe(PHRASES.length)
  })

  it('has no blank display text', () => {
    expect(PHRASES.filter(p => p.text.trim() === '')).toEqual([])
  })

  it('offers real choices on the fill-in-the-blank phrases', () => {
    expect(PHRASES.filter(p => hasChoices(p.segments)).length).toBeGreaterThan(30)
  })

  it('can compose every phrase without leaking braces', () => {
    for (const phrase of PHRASES) {
      const picks = phrase.segments
        .filter(s => s.kind === 'slot')
        .map(s => (s.kind === 'slot' && s.options.length ? s.options[0] : null))
      expect(compose(phrase.segments, picks)).not.toMatch(/[{}]/)
    }
  })
})

describe('plainPhrase', () => {
  it('keeps the given id and text verbatim', () => {
    const p = plainPhrase('em-0', 'Help me!', 'Emergency')
    expect(p).toMatchObject({ id: 'em-0', text: 'Help me!', category: 'Emergency' })
  })
})

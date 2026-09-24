import { describe, it, expect } from 'vitest'
import {
  BLANK,
  PHRASES,
  buildPhrases,
  choosableSlots,
  compose,
  hasBlank,
  hasChoices,
  makePhrase,
  parseSegments,
  plainPhrase,
  aliasOverlay,
  tableAliases,
  FORMER_IDS,
  phraseId,
} from '../../src/core/phrases'
import table from '../../src/core/imports/phrasetable.json'

// The source rows, before parsing. Some faults are only visible in what the
// table says — a parsed phrase has already lost the mistake.
const RAW_TABLE = table as { phrases: { txt: string }[]; aliases: Record<string, unknown>[] }

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

  // The leaked-brace tests above only catch a placeholder the parser cannot
  // read at all. These three catch the ones it reads and gets wrong, which
  // show up as a phrase that merely looks a bit odd — nothing throws, nothing
  // renders a brace, and the option the user wanted is quietly not there.

  // A misspelt alias silently becomes a blank to type in, since that is also
  // what an empty `{}` renders as — nothing distinguishes the two once parsed,
  // so this has to read the source. `lookupAlias` tries the name, its plural
  // and its singular, which is why phrases write `{direction}` against a
  // `directions` list; the check has to allow the same three.
  it('has no named placeholder that names nothing', () => {
    const defined = new Set(RAW_TABLE.aliases.flatMap(entry => Object.keys(entry)))
    const resolves = (name: string) => {
      const key = name.toLowerCase().split('.')[0]
      return defined.has(key) || defined.has(`${key}s`) || defined.has(key.replace(/s$/, ''))
    }

    const orphans: string[] = []
    for (const { txt } of RAW_TABLE.phrases) {
      for (const m of txt.matchAll(/\{([^{}[\]()]*)\}/g)) {
        const name = m[1].trim()
        if (!name) continue // `{}` is a typed blank on purpose
        if (!resolves(name)) orphans.push(`{${name}} in "${txt}"`)
      }
    }
    expect(orphans).toEqual([])
  })

  // `{[drink', 'eat']}` parses, and quietly offers one option fewer than it
  // reads like it should.
  it('keeps every quoted option in an inline list', () => {
    const wrong: string[] = []
    for (const entry of RAW_TABLE.phrases) {
      for (const m of entry.txt.matchAll(/\{\[([^\]]*)\]\}/g)) {
        const quoted = (m[1].match(/'/g) ?? []).length
        if (quoted % 2 !== 0) wrong.push(entry.txt)
      }
    }
    expect(wrong).toEqual([])
  })

  // Two blanks in a row ask the same question twice, and came from replacing
  // rows of dots with `{}` a character at a time.
  it('never puts two blanks next to each other', () => {
    expect(RAW_TABLE.phrases.filter(p => /\{\}\s*\{\}/.test(p.txt)).map(p => p.txt)).toEqual([])
  })
})

describe("the user's own alias lists", () => {
  /** A store from just its lists, which is all most of these care about. */
  const of = (lists: Record<string, string[]>, hidden: string[] = []) => ({ lists, hidden })
  const withAliases = (raw: string, lists: Record<string, string[]>) =>
    compose(parseSegments(raw, aliasOverlay(of(lists))))

  it('leaves phrases as blanks when nothing is filled in', () => {
    expect(withAliases('This is {name.nickname}', {})).toBe(`This is ${BLANK}`)
    expect(withAliases('I am going to call {contact}', {})).toBe(`I am going to call ${BLANK}`)
  })

  it('drops a single value straight in, with no picker step', () => {
    const segments = parseSegments('This is {name.nickname}', aliasOverlay(of({ 'name.nickname': ['Sam'] })))

    expect(compose(segments)).toBe('This is Sam')
    expect(hasChoices(segments)).toBe(false)
    expect(choosableSlots(segments)).toHaveLength(0)
  })

  it('offers a picker once there is more than one contact', () => {
    const segments = parseSegments('I am going to call {contact}', aliasOverlay(of({ contacts: ['Mum', 'Dad'] })))

    expect(hasChoices(segments)).toBe(true)
    expect(choosableSlots(segments)[0].options).toEqual(['Mum', 'Dad'])
    expect(compose(segments, ['Dad'])).toBe('I am going to call Dad')
  })

  it('fills a lone contact without asking', () => {
    expect(withAliases('I am going to call {contact}', { contacts: ['Mum'] })).toBe('I am going to call Mum')
  })

  // The one edit the panel could not otherwise carry out. A list the user has
  // emptied has to stay empty rather than falling back to the shipped words —
  // taking a word off a list is the whole of what "editable" means here.
  it('honours a list the user has emptied', () => {
    const segments = parseSegments('Do you like {pronouns}?', aliasOverlay(of({ pronouns: [] })))
    expect(choosableSlots(segments)).toHaveLength(0)
    expect(compose(segments)).toBe(`Do you like ${BLANK}?`)
  })

  it('replaces a shipped list rather than adding to it', () => {
    const segments = parseSegments('Do you like {pronouns}?', aliasOverlay(of({ pronouns: ['ze', 'zir'] })))
    expect(choosableSlots(segments)[0].options).toEqual(['ze', 'zir'])
  })

  it('resolves a list the user invented, by the name they gave it', () => {
    const segments = parseSegments('I would like a {drinks}', aliasOverlay(of({ drinks: ['tea', 'coffee'] })))
    expect(choosableSlots(segments)[0].options).toEqual(['tea', 'coffee'])
  })

  it('does not disturb lists the table already provides', () => {
    const [pronouns] = parseSegments('Do you like {pronouns}?', aliasOverlay(of({ contacts: ['Mum'] })))
      .filter(s => s.kind === 'slot')
      .map(s => (s.kind === 'slot' ? s.options : []))
    expect(pronouns).toContain('they')
  })
})

// What the panel is seeded from.
// Every phrase Peri ships is under Library, once. They came in forty-odd
// categories with the same words in two, three and four of them — "Good
// morning" was under Interpersonal, Texting and Time of Day — and a gaze has to
// read past every copy to reach the one it meant.
describe('the shipped table', () => {
  const rows = (
    table as { phrases: { txt: string; category: string; was?: string; merged?: string[] }[] }
  ).phrases.filter(r => r.txt?.trim())

  it('files every phrase under Library', () => {
    expect([...new Set(PHRASES.map(p => p.category))]).toEqual(['Library'])
  })

  // Compared as shown, and without regard to case: "No Way" and "No way", or
  // "What is next ?" and "What is next?", are one cell read twice.
  it('lists each wording once', () => {
    const seen = new Map<string, number>()
    for (const p of PHRASES) seen.set(p.text.toLowerCase(), (seen.get(p.text.toLowerCase()) ?? 0) + 1)
    expect([...seen].filter(([, n]) => n > 1).map(([text]) => text)).toEqual([])
  })

  // Everything somebody has done to a phrase is written against its id, which
  // is the category and the words together — made from Library, every one of
  // those would have come loose at once.
  it('keeps the id each phrase had under the category it came in', () => {
    const byText = new Map(PHRASES.map(p => [p.source, p.id]))
    const moved = rows.filter(r => byText.get(r.txt.trim()) !== phraseId(r.was ?? r.category, r.txt.trim()))
    expect(moved.map(r => r.txt)).toEqual([])
    expect(byText.get("It's not my cup of tea")).toBe(phraseId('Idioms', "It's not my cup of tea"))
  })

  it('says where each phrase came from', () => {
    expect(rows.filter(r => !r.was).map(r => r.txt)).toEqual([])
  })

  it('points every copy it dropped at a phrase that is on the board', () => {
    const ids = new Set(PHRASES.map(p => p.id))
    expect(FORMER_IDS.size).toBe(rows.reduce((n, r) => n + (r.merged?.length ?? 0), 0))
    expect(FORMER_IDS.size).toBeGreaterThan(200)
    expect([...FORMER_IDS.values()].filter(id => !ids.has(id))).toEqual([])
    // A former id that is also a current one would fold a phrase into another.
    expect([...FORMER_IDS.keys()].filter(id => ids.has(id))).toEqual([])
  })

  it('folds the copies of one wording into the first, and a differently written copy too', () => {
    const idOf = (text: string) => PHRASES.find(p => p.source === text)?.id
    expect(FORMER_IDS.get(phraseId('Texting', 'Good morning'))).toBe(idOf('Good morning'))
    expect(FORMER_IDS.get(phraseId('Interpersonal', 'Good morning'))).toBe(idOf('Good morning'))
    expect(FORMER_IDS.get(phraseId('Exclamations', 'No Way'))).toBe(idOf('No way'))
  })
})

describe('tableAliases', () => {
  it('hands back every list the table ships, in a readable order', () => {
    const shipped = tableAliases()
    expect(Object.keys(shipped)).toContain('pronouns')
    expect(shipped.pronouns).toContain('they')
    expect(Object.keys(shipped)).toEqual([...Object.keys(shipped)].sort((a, b) => a.localeCompare(b)))
  })

  // The two the table ships empty, because there is nowhere in the data to put
  // a particular person. They are still listed, so the panel offers them.
  it('lists the ones that arrive empty', () => {
    const shipped = tableAliases()
    expect(Object.keys(shipped)).toContain('contacts')
    expect(shipped.contacts).toEqual([])
  })

  it('hands back a copy, so editing one does not edit the table', () => {
    tableAliases().pronouns.push('mangled')
    expect(tableAliases().pronouns).not.toContain('mangled')
  })
})

describe('buildPhrases', () => {
  const of = (lists: Record<string, string[]>, hidden: string[] = []) => ({ lists, hidden })

  it('matches the default export when given no lists', () => {
    expect(buildPhrases().length).toBe(PHRASES.length)
  })

  it('keeps phrase ids stable when a list changes', () => {
    // Ids hash the source text, so saved edits survive an alias edit.
    const before = buildPhrases()
    const after = buildPhrases(of({ contacts: ['Mum', 'Dad'] }))
    expect(after.map(p => p.id)).toEqual(before.map(p => p.id))
  })

  it('resolves the phrases that used to be dead for want of a name', () => {
    const filled = buildPhrases(of({ 'name.nickname': ['Ada'], contacts: ['Mum', 'Dad'] }))
    const texts = filled.map(p => p.text)

    expect(texts).toContain('This is Ada')
    // Asked of the segments: a blank puts no characters in the text, so there
    // is nothing there to search for — and `''.includes('')` answers yes about
    // every phrase on the board.
    expect(filled.some(p => /going to call/.test(p.text) && !hasBlank(p.segments))).toBe(true)
  })

  it('still leaves genuinely anonymous blanks alone', () => {
    // "Did you see {}" names no alias, so there is nothing to fill it with.
    const filled = buildPhrases(of({ 'name.nickname': ['Ada'], contacts: ['Mum'] }))
    expect(filled.some(p => hasBlank(p.segments))).toBe(true)
  })
})

describe('plainPhrase', () => {
  it('keeps the given id and text verbatim', () => {
    const p = plainPhrase('em-0', 'Help me!', 'Emergency')
    expect(p).toMatchObject({ id: 'em-0', text: 'Help me!', category: 'Emergency' })
  })
})

import { describe, it, expect } from 'vitest'
import {
  BLANK,
  EMPTY_PROFILE,
  PHRASES,
  buildPhrases,
  choosableSlots,
  compose,
  hasBlank,
  hasChoices,
  makePhrase,
  parseSegments,
  plainPhrase,
  profileAliases,
  type Profile,
} from './phrases'
import table from './imports/phrasetable.json'

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

describe('user profile aliases', () => {
  const profile = (patch: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, ...patch })
  const withProfile = (raw: string, p: Profile) => compose(parseSegments(raw, profileAliases(p)))

  it('leaves phrases as blanks when nothing is filled in', () => {
    expect(withProfile('This is {name.nickname}', EMPTY_PROFILE)).toBe(`This is ${BLANK}`)
    expect(withProfile('I am going to call {contact}', EMPTY_PROFILE)).toBe(`I am going to call ${BLANK}`)
  })

  it('drops a single value straight in, with no picker step', () => {
    const p = profile({ name: { given: '', surname: '', nickname: 'Sam' } })
    const segments = parseSegments('This is {name.nickname}', profileAliases(p))

    expect(compose(segments)).toBe('This is Sam')
    expect(hasChoices(segments)).toBe(false)
    expect(choosableSlots(segments)).toHaveLength(0)
  })

  it('offers a picker once there is more than one contact', () => {
    const p = profile({ contacts: ['Mum', 'Dad'] })
    const segments = parseSegments('I am going to call {contact}', profileAliases(p))

    expect(hasChoices(segments)).toBe(true)
    expect(choosableSlots(segments)[0].options).toEqual(['Mum', 'Dad'])
    expect(compose(segments, ['Dad'])).toBe('I am going to call Dad')
  })

  it('fills a lone contact without asking', () => {
    const p = profile({ contacts: ['Mum'] })
    expect(withProfile('I am going to call {contact}', p)).toBe('I am going to call Mum')
  })

  it('ignores blank and whitespace-only entries', () => {
    const p = profile({ contacts: ['  ', ''], name: { given: '  ', surname: '', nickname: '' } })
    expect(withProfile('This is {name.nickname}', p)).toBe(`This is ${BLANK}`)
    expect(withProfile('I am going to call {contact}', p)).toBe(`I am going to call ${BLANK}`)
  })

  it('builds a bare {name} from the fullest form given', () => {
    const full = profileAliases(profile({ name: { given: 'Ada', surname: 'Lovelace', nickname: 'Ada' } }))
    expect(full.get('name')).toEqual(['Ada Lovelace'])

    const onlyNick = profileAliases(profile({ name: { given: '', surname: '', nickname: 'Ada' } }))
    expect(onlyNick.get('name')).toEqual(['Ada'])
  })

  it('does not disturb aliases the table already provides', () => {
    const p = profile({ contacts: ['Mum'] })
    const [pronouns] = parseSegments('Do you like {pronouns}?', profileAliases(p))
      .filter(s => s.kind === 'slot')
      .map(s => (s.kind === 'slot' ? s.options : []))
    expect(pronouns).toContain('they')
  })
})

describe('buildPhrases', () => {
  it('matches the default export when given no profile', () => {
    expect(buildPhrases().length).toBe(PHRASES.length)
  })

  it('keeps phrase ids stable when the profile changes', () => {
    // Ids hash the source text, so saved edits survive a profile edit.
    const before = buildPhrases(EMPTY_PROFILE)
    const after = buildPhrases({ ...EMPTY_PROFILE, contacts: ['Mum', 'Dad'] })
    expect(after.map(p => p.id)).toEqual(before.map(p => p.id))
  })

  it('resolves the profile-backed phrases that used to be dead', () => {
    const filled = buildPhrases({
      name: { given: 'Ada', surname: '', nickname: 'Ada' },
      contacts: ['Mum', 'Dad'],
    })
    const texts = filled.map(p => p.text)

    expect(texts).toContain('This is Ada')
    // Asked of the segments: a blank puts no characters in the text, so there
    // is nothing there to search for — and `''.includes('')` answers yes about
    // every phrase on the board.
    expect(filled.some(p => /going to call/.test(p.text) && !hasBlank(p.segments))).toBe(true)
  })

  it('still leaves genuinely anonymous blanks alone', () => {
    // "Did you see {}" names no alias, so there is nothing to fill it with.
    const filled = buildPhrases({ name: { given: 'Ada', surname: '', nickname: 'Ada' }, contacts: ['Mum'] })
    expect(filled.some(p => hasBlank(p.segments))).toBe(true)
  })
})

describe('plainPhrase', () => {
  it('keeps the given id and text verbatim', () => {
    const p = plainPhrase('em-0', 'Help me!', 'Emergency')
    expect(p).toMatchObject({ id: 'em-0', text: 'Help me!', category: 'Emergency' })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { PHRASE_SORTS, sortName, sortPhrases, sortsFor } from '../../src/core/sort'
import {
  DEFAULT_SORT,
  forgetUse,
  loadPhraseSorts,
  loadUsage,
  recordUse,
  savePhraseSorts,
  saveUsage,
  setSortFor,
  sortFor,
  type PhraseSort,
  type PhraseUsage,
} from '../../src/core/store'
import { plainPhrase, type Phrase } from '../../src/core/phrases'

// The four arrangements the grid rail offers, and the record they are arranged
// by. Driven through the app in App.test.tsx; this is the arithmetic underneath,
// where the ties and the phrases nobody has used yet can actually be seen.

const board = (...texts: string[]): Phrase[] => texts.map((t, i) => plainPhrase(`p${i}`, t, 'Home'))

const said = (phrases: Phrase[]) => phrases.map(p => p.text)

/** A usage record built by naming the phrase, its count, and when it was last used. */
const usageOf = (...entries: [id: string, count: number, at: number][]): PhraseUsage =>
  Object.fromEntries(entries.map(([id, count, at]) => [id, { count, at }]))

describe('the board’s own order', () => {
  // The grid starts its window again whenever the array it is given changes
  // identity, so a copy here would collapse the window — and the view with it —
  // every time anything else on the screen moved.
  it('hands back the very same array, not a copy of it', () => {
    const phrases = board('one', 'two', 'three')
    expect(sortPhrases(phrases, 'custom', {})).toBe(phrases)
  })

  it('is what a usage record cannot change', () => {
    const phrases = board('one', 'two', 'three')
    expect(said(sortPhrases(phrases, 'custom', usageOf(['p2', 9, 900])))).toEqual(['one', 'two', 'three'])
  })
})

// The user's own arrangement, built by hand in edit mode. It reaches Custom
// order and nothing else: A–Z and the two that follow use are answers to a
// different question, and would be no use if a stored arrangement overrode them.
describe('an arrangement made by hand', () => {
  it('puts the phrases where they were put', () => {
    const phrases = board('one', 'two', 'three')
    expect(said(sortPhrases(phrases, 'custom', {}, ['p2', 'p0', 'p1']))).toEqual(['three', 'one', 'two'])
  })

  it('leaves a phrase the arrangement has never heard of at the end', () => {
    const phrases = board('one', 'two', 'three')
    expect(said(sortPhrases(phrases, 'custom', {}, ['p2']))).toEqual(['three', 'one', 'two'])
  })

  it('skips an id naming a phrase that is not there rather than leaving a hole', () => {
    const phrases = board('one', 'two')
    expect(said(sortPhrases(phrases, 'custom', {}, ['gone', 'p1', 'p0']))).toEqual(['two', 'one'])
  })

  it('is the very same array when nothing has been arranged', () => {
    const phrases = board('one', 'two')
    expect(sortPhrases(phrases, 'custom', {}, [])).toBe(phrases)
  })

  it('reaches none of the other three', () => {
    const phrases = board('Banana', 'Apple')
    const arrangement = ['p0', 'p1']
    expect(said(sortPhrases(phrases, 'alpha', {}, arrangement))).toEqual(['Apple', 'Banana'])
    const usage = usageOf(['p1', 1, 100])
    expect(said(sortPhrases(phrases, 'recent', usage, arrangement))).toEqual(['Apple', 'Banana'])
    expect(said(sortPhrases(phrases, 'frequent', usage, arrangement))).toEqual(['Apple', 'Banana'])
  })
})

describe('A to Z', () => {
  it('puts them in alphabetical order', () => {
    expect(said(sortPhrases(board('Banana', 'apple', 'Cherry'), 'alpha', {}))).toEqual([
      'apple',
      'Banana',
      'Cherry',
    ])
  })

  // The same rule search matches by: nobody types the asterisks they can see are
  // not there, and nobody looks for a bold phrase under the punctuation either.
  it('files a phrase by what it says, not by how it is marked up', () => {
    const sorted = sortPhrases(board('**Zebra**', '**Apple**', 'Mango'), 'alpha', {})
    expect(said(sorted)).toEqual(['**Apple**', 'Mango', '**Zebra**'])
  })

  it('leaves the array it was given alone', () => {
    const phrases = board('Banana', 'apple')
    sortPhrases(phrases, 'alpha', {})
    expect(said(phrases)).toEqual(['Banana', 'apple'])
  })
})

describe('recently used', () => {
  it('puts the most recent first', () => {
    const phrases = board('one', 'two', 'three')
    const usage = usageOf(['p0', 1, 100], ['p1', 1, 300], ['p2', 1, 200])
    expect(said(sortPhrases(phrases, 'recent', usage))).toEqual(['two', 'three', 'one'])
  })

  /**
   * A board that has barely been used must not come out shuffled. Ranking the
   * unused among themselves is the opposite of what asking for this order means.
   */
  it('leaves the phrases nobody has used after the ones somebody has, in the board’s order', () => {
    const phrases = board('one', 'two', 'three', 'four')
    const usage = usageOf(['p3', 1, 100], ['p1', 1, 200])
    expect(said(sortPhrases(phrases, 'recent', usage))).toEqual(['two', 'four', 'one', 'three'])
  })

  it('breaks a tie on the same moment by how often, and then by the board', () => {
    const phrases = board('one', 'two', 'three')
    const usage = usageOf(['p0', 1, 500], ['p1', 4, 500], ['p2', 1, 500])
    expect(said(sortPhrases(phrases, 'recent', usage))).toEqual(['two', 'one', 'three'])
  })

  it('is the board’s own order when nothing has been used', () => {
    expect(said(sortPhrases(board('one', 'two', 'three'), 'recent', {}))).toEqual(['one', 'two', 'three'])
  })
})

describe('most used', () => {
  it('puts the highest count first', () => {
    const phrases = board('one', 'two', 'three')
    const usage = usageOf(['p0', 2, 100], ['p1', 9, 100], ['p2', 5, 100])
    expect(said(sortPhrases(phrases, 'frequent', usage))).toEqual(['two', 'three', 'one'])
  })

  it('breaks a tie on the same count by which was used last', () => {
    const phrases = board('one', 'two', 'three')
    const usage = usageOf(['p0', 3, 100], ['p1', 3, 300], ['p2', 3, 200])
    expect(said(sortPhrases(phrases, 'frequent', usage))).toEqual(['two', 'three', 'one'])
  })

  it('leaves the phrases nobody has used after the ones somebody has, in the board’s order', () => {
    const phrases = board('one', 'two', 'three', 'four')
    const usage = usageOf(['p2', 1, 100])
    expect(said(sortPhrases(phrases, 'frequent', usage))).toEqual(['three', 'one', 'two', 'four'])
  })

  it('is the board’s own order when nothing has been used', () => {
    expect(said(sortPhrases(board('one', 'two', 'three'), 'frequent', {}))).toEqual(['one', 'two', 'three'])
  })
})

// A record outlives the phrase it was about — a deleted phrase, or a board
// restored from a backup written on another device.
it('ignores a count naming a phrase that is not on the board', () => {
  const phrases = board('one', 'two')
  const usage = usageOf(['gone', 99, 9999], ['p1', 1, 100])
  expect(said(sortPhrases(phrases, 'recent', usage))).toEqual(['two', 'one'])
  expect(said(sortPhrases(phrases, 'frequent', usage))).toEqual(['two', 'one'])
})

describe('counting a use', () => {
  it('starts a phrase nobody has used at one', () => {
    expect(recordUse({}, 'p1', 500)).toEqual({ p1: { count: 1, at: 500 } })
  })

  it('counts up, and moves the moment on', () => {
    const once = recordUse({}, 'p1', 500)
    expect(recordUse(once, 'p1', 900)).toEqual({ p1: { count: 2, at: 900 } })
  })

  it('leaves every other phrase alone', () => {
    const usage = usageOf(['p1', 3, 100])
    expect(recordUse(usage, 'p2', 500).p1).toEqual({ count: 3, at: 100 })
  })

  it('does not change the record it was given', () => {
    const usage = usageOf(['p1', 3, 100])
    recordUse(usage, 'p1', 500)
    expect(usage.p1).toEqual({ count: 3, at: 100 })
  })

  it('ignores a phrase with no id', () => {
    const usage = usageOf(['p1', 1, 100])
    expect(recordUse(usage, '', 500)).toBe(usage)
  })
})

describe('forgetting a deleted phrase', () => {
  it('takes its count away', () => {
    expect(forgetUse(usageOf(['p1', 3, 100], ['p2', 1, 200]), 'p1')).toEqual({ p2: { count: 1, at: 200 } })
  })

  it('hands back the same record when there was nothing to forget', () => {
    const usage = usageOf(['p1', 3, 100])
    expect(forgetUse(usage, 'p2')).toBe(usage)
  })

  it('does not change the record it was given', () => {
    const usage = usageOf(['p1', 3, 100])
    forgetUse(usage, 'p1')
    expect(usage.p1).toEqual({ count: 3, at: 100 })
  })
})

describe('what is kept on the device', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips', () => {
    const usage = usageOf(['p1', 3, 100], ['p2', 1, 200])
    saveUsage(usage)
    expect(loadUsage()).toEqual(usage)
  })

  it('is empty before anything has been used', () => {
    expect(loadUsage()).toEqual({})
  })

  it('reads nothing out of damage', () => {
    // An array is the one that gets past a parse: its indices would become the
    // phrase ids, so a list of entries reads back as usage for phrases called
    // "0" and "1".
    const damaged = ['not json', '[]', 'null', '"words"', '7', '[{"count":2,"at":100}]']
    for (const raw of damaged) {
      localStorage.setItem('peri_usage', raw)
      expect(loadUsage(), raw).toEqual({})
    }
  })

  /**
   * A count of nought says nothing and a negative one is damage, and either
   * would sort a phrase nobody has used above one somebody has.
   */
  it('drops an entry that could not have come from using a phrase', () => {
    localStorage.setItem(
      'peri_usage',
      JSON.stringify({
        good: { count: 2, at: 100 },
        zero: { count: 0, at: 100 },
        negative: { count: -3, at: 100 },
        notANumber: { count: 'lots', at: 100 },
        infinite: { count: Infinity, at: 100 },
        noMoment: { count: 1, at: 'yesterday' },
        notAnEntry: 4,
        nothing: null,
      }),
    )
    expect(loadUsage()).toEqual({ good: { count: 2, at: 100 } })
  })

  it('rounds a fractional count down rather than dropping the phrase', () => {
    localStorage.setItem('peri_usage', JSON.stringify({ p1: { count: 2.7, at: 100 } }))
    expect(loadUsage()).toEqual({ p1: { count: 2, at: 100 } })
  })
})

// One order per tab, keyed by its filter id. The categories are not alike: a
// long reference list is worth having alphabetically, a short one by what gets
// used, and one somebody arranged by hand worth leaving as they arranged it.
describe('which order each tab is showing', () => {
  beforeEach(() => localStorage.clear())

  // Asserted as the word rather than through DEFAULT_SORT, or moving the
  // default again would move this test with it and prove nothing.
  it('is Most used for a tab nobody has chosen for', () => {
    expect(sortFor({}, 'Food')).toBe('frequent')
    expect(sortFor({ Food: 'alpha' }, 'Home')).toBe('frequent')
    expect(DEFAULT_SORT).toBe('frequent')
  })

  it('is what was chosen for the tab it was chosen under', () => {
    expect(sortFor({ Food: 'alpha', all: 'recent' }, 'Food')).toBe('alpha')
  })

  it('changes one tab and leaves every other alone', () => {
    expect(setSortFor({ Food: 'alpha' }, 'Home', 'recent')).toEqual({ Food: 'alpha', Home: 'recent' })
  })

  // Storing the default says nothing — and a record that is all defaults is an
  // empty one.
  it('drops the entry rather than storing the default', () => {
    expect(setSortFor({ Food: 'alpha', Home: 'recent' }, 'Food', 'frequent')).toEqual({ Home: 'recent' })
  })

  // The board's own order is no longer the default, so it has to be stored like
  // any other choice — it was the one value setSortFor threw away.
  it('stores the board’s own order rather than dropping it', () => {
    expect(setSortFor({}, 'Food', 'custom')).toEqual({ Food: 'custom' })
  })

  it('does not change the record it was given', () => {
    const sorts = { Food: 'alpha' } as const
    setSortFor(sorts, 'Food', 'recent')
    expect(sorts).toEqual({ Food: 'alpha' })
  })

  it('round-trips every one of the four', () => {
    for (const { id } of PHRASE_SORTS) {
      savePhraseSorts({ Food: id })
      expect(sortFor(loadPhraseSorts(), 'Food')).toBe(id)
    }
  })

  it('is empty before anything has been chosen', () => {
    expect(loadPhraseSorts()).toEqual({})
  })

  it('refuses a word it does not know, tab by tab', () => {
    savePhraseSorts({ Food: 'by-colour', Home: 'alpha' } as never)
    expect(loadPhraseSorts()).toEqual({ Home: 'alpha' })
  })

  it('reads nothing out of damage', () => {
    for (const raw of ['not json', '[]', 'null', '7', '"alpha"', '["alpha"]', '["alpha","recent"]']) {
      localStorage.setItem('peri_phrase_sort', raw)
      expect(loadPhraseSorts(), raw).toEqual({})
    }
  })

  /**
   * Written before there was one per tab, when the whole board shared a single
   * order. It was chosen while looking at some tab, and All is the one the board
   * opens on, so that is where it lands rather than being thrown away.
   */
  it('carries a single order written for the whole board onto All', () => {
    localStorage.setItem('peri_phrase_sort', 'recent')
    expect(loadPhraseSorts()).toEqual({ all: 'recent' })
  })

  it('carries nothing forward from a board that was on the default', () => {
    localStorage.setItem('peri_phrase_sort', 'frequent')
    expect(loadPhraseSorts()).toEqual({})
  })

  // All is where a single order lands, and All offers no Custom order — so that
  // one is dropped rather than written somewhere it could not be got back from.
  it('carries nothing forward from a board that was on the board’s own order', () => {
    localStorage.setItem('peri_phrase_sort', 'custom')
    expect(loadPhraseSorts()).toEqual({})
  })
})

/**
 * A hand arrangement belongs to one category, and All shows every category at
 * once — so All offers no Custom order, and neither does Sent. Hiding a tile
 * that is also a tab's way home is how you strand somebody, which is the whole
 * of why `sortFor` has to answer for a stored one too.
 */
describe('the tabs that are not a category', () => {
  it('offers all four under a category', () => {
    expect(sortsFor(true).map(s => s.id)).toEqual(['custom', 'alpha', 'recent', 'frequent'])
  })

  it('offers every one but Custom order where nothing can be arranged', () => {
    expect(sortsFor(false).map(s => s.id)).toEqual(['alpha', 'recent', 'frequent'])
  })

  // Built once each, so a picker that has not changed does not look as though
  // it has.
  it('hands back the same list every time', () => {
    expect(sortsFor(true)).toBe(sortsFor(true))
    expect(sortsFor(false)).toBe(sortsFor(false))
  })

  it('shows the default where a stored Custom order could not be got back from', () => {
    expect(sortFor({ all: 'custom' }, 'all', false)).toBe('frequent')
  })

  it('leaves every other stored order alone there', () => {
    expect(sortFor({ all: 'alpha' }, 'all', false)).toBe('alpha')
  })

  it('keeps a stored Custom order for a tab that can be arranged', () => {
    expect(sortFor({ Food: 'custom' }, 'Food', true)).toBe('custom')
    expect(sortFor({ Food: 'custom' }, 'Food')).toBe('custom')
  })
})

describe('the four on offer', () => {
  it('is every order the grid can be in, once each', () => {
    const ids = PHRASE_SORTS.map(s => s.id)
    expect(ids).toEqual(['custom', 'alpha', 'recent', 'frequent'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The rail button is one glyph, so its name is the only thing saying which
  // order is on — to a screen reader, and to anybody who has not learnt the mark.
  it('names each one', () => {
    for (const { id, name } of PHRASE_SORTS) expect(sortName(id)).toBe(name)
  })

  it('names something for an order it has never heard of', () => {
    expect(sortName('sideways' as PhraseSort)).toBe('Custom order')
  })
})

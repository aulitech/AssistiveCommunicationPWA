import { describe, it, expect } from 'vitest'
import { EMERGENCY_PHRASES, PHRASES, plainPhrase, type Phrase } from '../../src/core/phrases'
import { displayCategory, emptyStore, type PhraseStore } from '../../src/core/store'
import { IMPORTED_CATEGORY } from '../../src/core/backup'
import {
  applySheet,
  boardRows,
  describePlan,
  parseDelimited,
  planChanges,
  readRows,
  rowsToTable,
  sheetFilename,
  textOf,
  toCsv,
  toTsv,
  type SheetBoard,
  type SheetRow,
} from '../../src/core/sheet'

// The board as a spreadsheet, and a spreadsheet back onto the board.
//
// The board here is a small one built by hand — two of the phrases Peri ships,
// the emergency six, and whatever a test writes — resolved from the store by
// the rules `use-board` resolves the real one by. `tests/app/sheet.test.tsx`
// drives the same thing through the real board.

const plain = PHRASES.filter(p => p.segments.every(s => s.kind === 'text'))
const TEA = plain[0]!
const OTHER = plain.find(p => p.category !== TEA.category)!

/** The board a store makes, by `use-board`'s rules, for the phrases above. */
function boardOf(store: PhraseStore = emptyStore()): SheetBoard {
  const shown = (id: string, category: string) =>
    store.categoryOverrides[id] ?? displayCategory(category, store.categoryRenames)
  const emergency = EMERGENCY_PHRASES.filter(p => !store.hidden.includes(p.id)).map(p =>
    plainPhrase(p.id, store.overrides[p.id] ?? p.source, 'Emergency'),
  )
  const shipped = [TEA, OTHER]
    .filter(p => !store.hidden.includes(p.id))
    .map(p => plainPhrase(p.id, store.overrides[p.id] ?? p.source, shown(p.id, p.category)))
  const mine = store.custom
    .filter(c => !store.hidden.includes(c.id))
    .map(c =>
      plainPhrase(
        c.id,
        store.overrides[c.id] ?? c.text,
        c.category === 'Emergency' ? 'Emergency' : shown(c.id, c.category),
      ),
    )
  const phrases = [...emergency, ...shipped, ...mine]
  const categories = [
    ...new Set([...phrases.map(p => p.category).filter(c => c !== 'Emergency'), ...store.categories]),
  ]
  return { store, phrases, categories }
}

/** New ids that can be predicted, so a test can name what it added. */
function ids() {
  let n = 0
  return () => `custom-new-${++n}`
}

const row = (phrase: string, category = '', id = ''): SheetRow => ({ phrase, category, id })
const find = (board: SheetBoard, text: string) => board.phrases.find(p => p.source === text)
const on = (store: PhraseStore) => boardOf(store)

describe('the board as rows', () => {
  /**
   * **As it is arranged**: the emergency bar first, being the part somebody
   * reaches for without reading, then the tabs in the order they are shown,
   * each in its own arrangement.
   */
  it('writes the emergency bar first, then the tabs in order, each as arranged', () => {
    const phrases: Phrase[] = [
      plainPhrase('a', 'Apple', 'Food'),
      plainPhrase('b', 'Bread', 'Food'),
      plainPhrase('h', 'Hello', 'Greetings'),
      plainPhrase('em-0', 'Help me!', 'Emergency'),
    ]
    const rows = boardRows(phrases, ['Greetings', 'Food'], { Food: ['b', 'a'] })
    expect(rows.map(r => `${r.category}: ${r.phrase}`)).toEqual([
      'Emergency: Help me!',
      'Greetings: Hello',
      'Food: Bread',
      'Food: Apple',
    ])
  })

  // A phrase whose category the tab list somehow does not have is still a row.
  it('loses nothing to a category missing from the tabs', () => {
    const rows = boardRows([plainPhrase('x', 'Orphan', 'Lost')], [], {})
    expect(rows).toEqual([{ category: 'Lost', phrase: 'Orphan', id: 'x' }])
  })

  /**
   * **The source, not the words one choice of its slots shows** — a row read
   * back has to be the phrase it was, choices and all.
   */
  it('writes each phrase as it was written, slots and all', () => {
    const slotted = PHRASES.find(p => p.segments.some(s => s.kind === 'slot'))!
    expect(boardRows([slotted], [slotted.category], {})[0]!.phrase).toBe(slotted.source)
    expect(slotted.source).toMatch(/\{/)
  })

  /**
   * **Every ID wears a `#`.** Phrase ids are short base-36 hashes, and a
   * spreadsheet opening `12e45` reads a number in scientific notation and
   * writes it back as something else entirely.
   */
  it('marks every ID so no spreadsheet reads one as a number', () => {
    expect(rowsToTable([row('Tea', 'Drinks', '12e45'), row('New', 'Drinks')])).toEqual([
      ['Category', 'Phrase', 'ID'],
      ['Drinks', 'Tea', '#12e45'],
      ['Drinks', 'New', ''],
    ])
  })

  it('names the file for the day it was saved', () => {
    expect(sheetFilename('xlsx', new Date(2026, 8, 1))).toBe('peri-phrases-2026-09-01.xlsx')
    expect(sheetFilename('csv', new Date(2026, 11, 31))).toBe('peri-phrases-2026-12-31.csv')
  })
})

describe('writing text a spreadsheet will not rewrite', () => {
  const table = [
    ['Category', 'Phrase', 'ID'],
    ['Food', 'Fish, chips and "peas"', '#a1'],
    ['Notes', 'Line one\nLine two', ''],
    ['Spacing', '  spaced  ', ''],
    ['Lists', '- tea\n- coffee', ''],
    ['Sums', '=HYPERLINK("http://x")', ''],
    ['Handles', '@somebody', ''],
    ['Dates', '1/2', ''],
    ['Truth', 'TRUE', ''],
  ]

  /**
   * **A byte-order mark in front**, or Excel reads the file as the machine's
   * own code page and every accent comes out as two wrong characters; CRLF
   * between rows, which is what the format says and what Excel writes.
   */
  it('writes a CSV Excel reads as UTF-8, with the rows Excel expects', () => {
    const csv = toCsv([['Café', 'Crème']])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toBe('\uFEFFCafé,Crème\r\n')
  })

  it('quotes what has to be quoted and nothing else', () => {
    expect(toCsv([['plain', 'a,b', 'say "hi"', 'two\nlines', ' edge ']])).toBe(
      '\uFEFFplain,"a,b","say ""hi""","two\nlines"," edge "\r\n',
    )
  })

  /**
   * **A formula is disarmed in every format**, because a board is a file people
   * hand to each other and a cell that opens as `=HYPERLINK(…)` runs whatever it
   * says. A markdown bullet starts with one of those characters too.
   */
  it('puts an apostrophe in front of anything a spreadsheet would run', () => {
    const csv = parseDelimited(toCsv(table))
    expect(csv[5]![1]).toBe('\'=HYPERLINK("http://x")')
    expect(csv[4]![1]).toBe("'- tea\n- coffee")
    expect(csv[6]![1]).toBe("'@somebody")
  })

  /**
   * **Numbers only when pasting.** Opening a CSV, Excel shows an apostrophe
   * rather than obeying it, so guarding `1/2` there would print one in front of
   * it; a paste obeys it and hides it, so the cell shows the phrase.
   */
  it('guards what looks like a number or a date in a paste, and not in a CSV', () => {
    expect(parseDelimited(toCsv(table))[7]![1]).toBe('1/2')
    const pasted = parseDelimited(toTsv(table), '\t')
    expect(pasted[7]![1]).toBe("'1/2")
    expect(pasted[8]![1]).toBe("'TRUE")
  })

  /**
   * **Both come back as they went.** The apostrophes come off on the way in —
   * and only in front of something they could have been guarding, so a phrase
   * that begins with one of its own keeps it.
   */
  it('reads back exactly the phrases written, from either', () => {
    const expected = table
      .slice(1)
      .map(([category, phrase, id]) => ({ category, phrase: phrase!.trim(), id: id!.replace('#', '') }))
    for (const cells of [parseDelimited(toCsv(table)), parseDelimited(toTsv(table), '\t')]) {
      const read = readRows(cells)
      expect(read.ok && read.rows).toEqual(expected)
    }
  })

  it("leaves an apostrophe that is the phrase's own", () => {
    const read = readRows([['Phrase'], ["'Tis the season"], ["'cause I said so"]])
    expect(read.ok && read.rows.map(r => r.phrase)).toEqual(["'Tis the season", "'cause I said so"])
  })
})

describe('reading a table back', () => {
  /**
   * **Whichever encoding wrote it.** Excel on Windows saves "CSV (Comma
   * delimited)" in Windows-1252, not UTF-8, and read as UTF-8 every accent in it
   * becomes a replacement character; its "Unicode Text" is UTF-16 behind a
   * byte-order mark.
   */
  it('reads the encodings a spreadsheet saves text in', () => {
    expect(textOf(new TextEncoder().encode('Café'))).toBe('Café')
    expect(textOf(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe('Café')
    expect(textOf(new Uint8Array([0xff, 0xfe, 0x43, 0, 0xe9, 0]))).toBe('Cé')
    expect(textOf(new Uint8Array([0xfe, 0xff, 0, 0x43, 0, 0xe9]))).toBe('Cé')
  })

  // A photograph chosen by mistake is refused, not offered as a thousand
  // phrases of noise.
  it('knows a file that is not text at all', () => {
    expect(textOf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]))).toBeNull()
  })

  it('takes whichever separator the file uses', () => {
    expect(parseDelimited('Category;Phrase\nFood;Tea, please')).toEqual([
      ['Category', 'Phrase'],
      ['Food', 'Tea, please'],
    ])
    expect(parseDelimited('Category\tPhrase\r\nFood\tTea')).toEqual([
      ['Category', 'Phrase'],
      ['Food', 'Tea'],
    ])
    // Excel's own way of naming the separator.
    expect(parseDelimited('sep=;\nCategory;Phrase\nFood;Tea')).toEqual([
      ['Category', 'Phrase'],
      ['Food', 'Tea'],
    ])
  })

  it('reads the quoting the format has, and forgives what it does not', () => {
    expect(parseDelimited('"a ""b""",c\r\n"two\nlines",d\re,f"g"')).toEqual([
      ['a "b"', 'c'],
      ['two\nlines', 'd'],
      ['e', 'f"g"'],
    ])
  })

  /**
   * **A paste is read as tab-separated**, never guessed at: every spreadsheet
   * puts tabs on the clipboard, and a single column of phrases guessed at
   * would be split at its commas.
   */
  it('keeps a pasted column of phrases whole, commas and all', () => {
    expect(parseDelimited('Hello, how are you\nYes, please', '\t')).toEqual([
      ['Hello, how are you'],
      ['Yes, please'],
    ])
  })

  it('ignores the byte-order mark a CSV starts with', () => {
    expect(parseDelimited('\uFEFFPhrase\nTea')).toEqual([['Phrase'], ['Tea']])
  })

  /**
   * **Headed, the columns are found by name**, in any order, so a sheet somebody
   * rearranged still reads — and by the names a person would give them.
   */
  it('finds the columns by their headings, in any order', () => {
    const read = readRows([
      ['ID', 'Text', 'Tab'],
      ['#a1', 'Tea please', 'Drinks'],
    ])
    expect(read.ok && read.rows).toEqual([{ id: 'a1', phrase: 'Tea please', category: 'Drinks' }])
  })

  // Unheaded, one column is phrases — what somebody pasting a list has — and
  // more are taken in the order Peri writes them.
  it('reads a sheet with no headings the way Peri writes one', () => {
    const one = readRows([['Tea please'], ['Coffee please']])
    expect(one.ok && one.rows.map(r => [r.category, r.phrase])).toEqual([
      ['', 'Tea please'],
      ['', 'Coffee please'],
    ])
    const three = readRows([['Drinks', 'Tea please', '#a1']])
    expect(three.ok && three.rows).toEqual([{ category: 'Drinks', phrase: 'Tea please', id: 'a1' }])
  })

  it('skips rows with no phrase, and cleans the ones it keeps', () => {
    const read = readRows([
      ['Category', 'Phrase', 'ID'],
      ['Drinks', '  Tea\r\nplease  ', ' #a1 '],
      ['Drinks', '', '#a2'],
      ['', '', ''],
      ['Drinks', 'Coffee', 'not an id!'],
    ])
    expect(read.ok && read.rows).toEqual([
      { category: 'Drinks', phrase: 'Tea\nplease', id: 'a1' },
      { category: 'Drinks', phrase: 'Coffee', id: '' },
    ])
    expect(read.ok && read.hasIds).toBe(true)
  })

  it('says what is wrong with a sheet it cannot use', () => {
    const error = (cells: string[][]) => {
      const read = readRows(cells)
      return read.ok ? null : read.error
    }
    expect(error([])).toMatch(/empty/)
    expect(error([['', '']])).toMatch(/empty/)
    expect(
      error([
        ['Category', 'ID'],
        ['Food', '#a'],
      ]),
    ).toMatch(/no Phrase column/)
    expect(
      error([
        ['Category', 'Phrase'],
        ['Food', ''],
      ]),
    ).toMatch(/no phrases/)
    expect(error([['Phrase'], ...Array.from({ length: 20_001 }, () => ['x'])])).toMatch(/more than a board holds/)
  })

  it('knows whether the sheet carries IDs at all', () => {
    const read = readRows([
      ['Category', 'Phrase', 'ID'],
      ['Drinks', 'Tea', ''],
    ])
    expect(read.ok && read.hasIds).toBe(false)
  })
})

describe('putting a sheet onto the board', () => {
  it('adds a row with no ID as a new phrase, under its category', () => {
    const { store, plan } = applySheet([row('Tea please', 'Drinks')], boardOf(), 'merge', ids())
    expect(store.custom).toEqual([{ id: 'custom-new-1', text: 'Tea please', category: 'Drinks' }])
    expect(store.categories).toContain('Drinks')
    expect(plan).toMatchObject({ added: 1, changed: 0, removed: 0 })
  })

  it('files a row that names no category under Imported', () => {
    const { store } = applySheet([row('Tea please')], boardOf(), 'merge', ids())
    expect(store.custom[0]!.category).toBe(IMPORTED_CATEGORY)
  })

  // Typed in a hurry, "greetings" is the Greetings tab rather than a second one
  // beside it — and two rows inventing a category in two spellings agree.
  it('matches a category whatever its case', () => {
    const { store } = applySheet(
      [row('One', TEA.category.toUpperCase()), row('Two', 'new stuff'), row('Three', 'New Stuff')],
      boardOf(),
      'merge',
      ids(),
    )
    expect(store.custom.map(c => c.category)).toEqual([TEA.category, 'new stuff', 'new stuff'])
  })

  /**
   * **Found rather than added again**: the same wording in the same category,
   * matched as the editor matches — case and spacing aside — so a sheet read
   * twice does not put everything on the board twice.
   */
  it('adds nothing already on the board, and nothing twice', () => {
    const sheet = [row(`  ${TEA.source.toUpperCase()}  `, TEA.category), row('Tea please', 'Drinks')]
    const once = applySheet(sheet, boardOf(), 'merge', ids())
    expect(once.plan).toMatchObject({ added: 1, unchanged: 1 })
    const twice = applySheet(sheet, on(once.store), 'merge', ids())
    expect(twice.plan).toMatchObject({ added: 0, unchanged: 2 })
    expect(twice.store.custom).toHaveLength(1)
  })

  it('rewords a phrase by its ID, whoever wrote it', () => {
    const store = { ...emptyStore(), custom: [{ id: 'custom-1', text: 'My tea', category: 'Drinks' }] }
    const { store: next, plan } = applySheet(
      [row('Tea, strong', TEA.category, TEA.id), row('My tea, milky', 'Drinks', 'custom-1')],
      on(store),
      'merge',
      ids(),
    )
    expect(next.overrides).toEqual({ [TEA.id]: 'Tea, strong', 'custom-1': 'My tea, milky' })
    expect(plan).toMatchObject({ changed: 2, added: 0 })
    expect(find(on(next), 'Tea, strong')?.category).toBe(TEA.category)
  })

  it('moves a phrase by its ID, the way the editor moves one', () => {
    const store = { ...emptyStore(), custom: [{ id: 'custom-1', text: 'My tea', category: 'Drinks' }] }
    const { store: next } = applySheet(
      [row(TEA.source, 'Favourites', TEA.id), row('My tea', 'Favourites', 'custom-1')],
      on(store),
      'merge',
      ids(),
    )
    // Peri's own by an override; somebody's own by its category, which it carries.
    expect(next.categoryOverrides).toEqual({ [TEA.id]: 'Favourites' })
    expect(next.custom[0]!.category).toBe('Favourites')
    expect(next.categories).toContain('Favourites')
    expect(find(on(next), TEA.source)?.category).toBe('Favourites')
  })

  /**
   * **Nothing moves onto or off the emergency bar unless somebody wrote it.**
   * The bar Peri ships is a fixed six, and a sheet filing one under Greetings —
   * or a greeting under Emergency — is taken as a wording change and no more.
   */
  it("leaves Peri's emergency phrases on the bar and its others off it", () => {
    const help = EMERGENCY_PHRASES[0]!
    const { store: next, plan } = applySheet(
      [row('Help me now!', 'Greetings', help.id), row(TEA.source, 'Emergency', TEA.id)],
      boardOf(),
      'merge',
      ids(),
    )
    expect(next.overrides).toEqual({ [help.id]: 'Help me now!' })
    expect(next.categoryOverrides).toEqual({})
    expect(plan).toMatchObject({ changed: 1, unchanged: 1 })
  })

  it('puts a phrase somebody wrote onto the bar, and a new one there too', () => {
    const store = { ...emptyStore(), custom: [{ id: 'custom-1', text: 'Get the nurse', category: 'People' }] }
    const { store: next } = applySheet(
      [row('Get the nurse', 'emergency', 'custom-1'), row('I feel faint', 'Emergency')],
      on(store),
      'merge',
      ids(),
    )
    const bar = on(next)
      .phrases.filter(p => p.category === 'Emergency')
      .map(p => p.source)
    expect(bar).toEqual(expect.arrayContaining(['Get the nurse', 'I feel faint']))
    // The bar is not a tab, so no category is made for it.
    expect(next.categories).not.toContain('Emergency')
  })

  /**
   * **Named again, a phrase taken off the board comes back** — as the row has
   * it. Only Peri's own can: one somebody wrote and deleted is gone, and its row
   * is a new phrase.
   */
  it('brings back a phrase that was taken off the board', () => {
    const store = { ...emptyStore(), hidden: [TEA.id, OTHER.id] }
    const { store: next, plan } = applySheet(
      [row(TEA.source, TEA.category, TEA.id), row('Reworded', OTHER.category, OTHER.id)],
      on(store),
      'merge',
      ids(),
    )
    expect(next.hidden).toEqual([])
    expect(next.overrides).toEqual({ [OTHER.id]: 'Reworded' })
    expect(plan).toMatchObject({ restored: 2, added: 0 })
  })

  // From another device of theirs: the id is kept, so reading the same sheet
  // again finds the phrase rather than adding it a second time.
  it('keeps the ID of a phrase somebody wrote on another board', () => {
    const sheet = [row('From my phone', 'Drinks', 'custom-elsewhere')]
    const once = applySheet(sheet, boardOf(), 'merge', ids())
    expect(once.store.custom[0]!.id).toBe('custom-elsewhere')
    expect(applySheet(sheet, on(once.store), 'merge', ids()).plan).toMatchObject({ added: 0, unchanged: 1 })
  })

  // The same phrase twice is settled by the first row, not by whichever came
  // last — the first is the one somebody sees at the top.
  it('takes the first row for an ID that appears twice', () => {
    const { store } = applySheet(
      [row('First', TEA.category, TEA.id), row('Second', TEA.category, TEA.id)],
      boardOf(),
      'merge',
      ids(),
    )
    expect(store.overrides[TEA.id]).toBe('First')
  })

  it('never takes a phrase away when adding', () => {
    const { store, plan } = applySheet([row('Tea please', 'Drinks')], boardOf(), 'merge', ids())
    expect(on(store).phrases).toHaveLength(boardOf().phrases.length + 1)
    expect(plan.removed).toBe(0)
  })
})

describe('replacing the board with a sheet', () => {
  const mine = { id: 'custom-1', text: 'My tea', category: 'Drinks' }
  const store = (): PhraseStore => ({
    ...emptyStore(),
    custom: [mine],
    overrides: { 'custom-1': 'My tea, milky' },
    emergencyOrder: ['em-1', 'em-0'],
    phraseOrder: { Drinks: ['custom-1'], [TEA.category]: [TEA.id, 'gone'] },
  })

  /**
   * **What the sheet leaves out goes** — deleted if somebody wrote it, hidden if
   * Peri shipped it, the rule the bin follows — and the arrangements are tidied
   * of it.
   */
  it('takes away whatever the sheet does not have', () => {
    const keep = [row(OTHER.source, OTHER.category, OTHER.id), row('Help me!', 'Emergency', 'em-0')]
    const { store: next, plan } = applySheet(keep, on(store()), 'replace', ids())
    expect(next.custom).toEqual([])
    expect(next.overrides).toEqual({})
    expect(next.hidden).toEqual(expect.arrayContaining([TEA.id, 'em-1', 'em-5']))
    expect(next.hidden).not.toContain(OTHER.id)
    expect(next.emergencyOrder).toEqual(['em-0'])
    expect(next.phraseOrder).toEqual({ [TEA.category]: ['gone'] })
    expect(
      on(next)
        .phrases.map(p => p.source)
        .sort(),
    ).toEqual([OTHER.source, 'Help me!'].sort())
    expect(plan.removed).toBe(boardOf(store()).phrases.length - 2)
  })

  // A row that lost its ID but kept its wording is still that phrase, and
  // replacing must not take away something the sheet plainly has.
  it('keeps a phrase whose row kept its wording and lost its ID', () => {
    const everything = boardOf(store()).phrases.map(p => row(p.source, p.category, p.id === TEA.id ? '' : p.id))
    const { plan } = applySheet(everything, on(store()), 'replace', ids())
    expect(plan).toMatchObject({ removed: 0, added: 0 })
  })

  it('does in merge exactly what it does in replace, bar the taking away', () => {
    const sheet = [row('Tea, strong', TEA.category, TEA.id), row('New', 'Drinks')]
    const merged = applySheet(sheet, on(store()), 'merge', ids())
    const replaced = applySheet(sheet, on(store()), 'replace', ids())
    expect(merged.plan).toEqual({ ...replaced.plan, removed: 0 })
    expect(replaced.store.overrides[TEA.id]).toBe('Tea, strong')
  })
})

describe('what an import will do, in a line', () => {
  const plan = { added: 12, changed: 3, restored: 1, unchanged: 2400, removed: 40 }

  it('counts what changes, and removals only when replacing', () => {
    expect(describePlan(plan, 'merge')).toBe('12 new, 3 changed, 1 brought back')
    expect(describePlan(plan, 'replace')).toBe('12 new, 3 changed, 1 brought back, 40 removed')
    expect(describePlan({ ...plan, added: 0, changed: 0, restored: 0 }, 'merge')).toBe('nothing to change')
  })

  // A sheet that matches the board changes nothing by adding, and may still
  // change something by replacing — the rows somebody deleted from it.
  it('knows when there is nothing to do', () => {
    const nothing = { added: 0, changed: 0, restored: 0, unchanged: 10, removed: 3 }
    expect(planChanges(nothing, 'merge')).toBe(false)
    expect(planChanges(nothing, 'replace')).toBe(true)
  })
})

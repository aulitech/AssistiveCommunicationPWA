// The board as a spreadsheet, and a spreadsheet back onto the board.
//
// A backup is a diff for putting a device back the way it was; this is the
// other thing people ask for, **the whole board as rows somebody can read and
// edit** — in Excel, in Google Sheets, in anything that opens a table. Writing
// two hundred phrases is a job for a keyboard and an afternoon, usually done by
// whoever helps somebody set their board up, and a spreadsheet is where that
// person already knows how to work.
//
// One row a phrase: **Categories, Phrase, ID** — every phrase is in Library,
// and the first cell lists the categories that refer to it as well, separated
// by semicolons; Emergency for a button on the bar. After the phrases, one row
// a word for the word lists the Aliases panel keeps, filed under the list's
// name in curly brackets.
//
//  * **The phrase is its source**, slots and markup and all — `{pronouns}`,
//    `**Help**` — so a row read back is the phrase it was, not the words one
//    choice of its slots happened to show.
//  * **The ID is what makes the sheet an editor rather than a list.** A row
//    whose ID is on the board rewords that phrase or changes its categories; a
//    row without one
//    is a new phrase; and replacing the board's phrases with the sheet's takes
//    away whatever the sheet left out. Written with a `#` in front, because
//    phrase ids are short base-36 hashes and a spreadsheet opening `12e45`
//    reads a number in scientific notation and writes it back as something
//    else — the mark makes every one of them text to every program there is.
//  * **Adding never takes anything away**, the rule a backup's merge follows,
//    and only replacing — which needs a sheet with IDs in it, or it would take
//    away everything — removes a phrase.
//
// Nothing here touches storage or the network: rows in, a store out, as
// `core/backup.ts` does it, so an import that is refused leaves nothing
// half-written and the whole of it can be tested without a browser.

import {
  FORMER_IDS,
  LIBRARY,
  aliasNames,
  aliasWords,
  EMERGENCY_PHRASES,
  hasList,
  PHRASES,
  tableAliases,
  type Aliases,
  type AliasStore,
  type Phrase,
} from './phrases'
import { newPhraseId, orderByIds, wordingKey, type PhraseStore } from './store'

const EMERGENCY = 'Emergency'

/** The columns, in the order Peri writes them. */
export const SHEET_HEADER = ['Categories', 'Phrase', 'ID']

/**
 * One row of a sheet. `id` is empty for a phrase the sheet adds. `category` is
 * the first cell as written: the categories it is in, separated by
 * semicolons — see `namedIn`.
 */
export interface SheetRow {
  category: string
  phrase: string
  id: string
}

/** What separates the categories in a row's first cell, as Peri writes it. */
const SEPARATOR = '; '

/**
 * The places a row's first cell names: its categories, and Emergency where it
 * is a button on the bar. **Library is where every phrase is**, so naming it
 * says nothing — a sheet from before categories were references files most of
 * its rows under it, or under a category Peri used to ship, and both read.
 */
export function namedIn(cell: string): string[] {
  return [
    ...new Set(
      cell
        .split(';')
        .map(c => c.trim())
        .filter(c => c !== '' && c.toLowerCase() !== LIBRARY.toLowerCase()),
    ),
  ]
}

/** A sheet longer than this is not a board, and reading it would stall the page. */
const MAX_ROWS = 20_000

// ── The board as rows ─────────────────────────────────────────────────────────

/**
 * Every phrase on the board, one row each: the emergency bar first, since it is
 * the part somebody reaches for without reading, then Library in its own
 * arrangement — each with the categories that refer to it, in the order their
 * tabs are in.
 */
export function boardRows(phrases: Phrase[], categories: string[], store: PhraseStore): SheetRow[] {
  const onBar = phrases.filter(p => p.category === EMERGENCY)
  const library = orderByIds(
    phrases.filter(p => p.category !== EMERGENCY),
    store.libraryOrder,
  )
  const named = (id: string) => categories.filter(c => store.members[c]?.includes(id)).join(SEPARATOR)
  return [
    ...onBar.map(p => ({ category: EMERGENCY, phrase: p.source, id: p.id })),
    ...library.map(p => ({ category: named(p.id), phrase: p.source, id: p.id })),
  ]
}

/**
 * A word on a list is filed under the list's name **in curly brackets**, the
 * way a phrase names it — `{contacts}` — with no ID. The brackets are what tell
 * it from a phrase, and the missing ID is what makes that safe: every phrase
 * row Peri writes carries one, so a category somebody did name in brackets
 * still comes back as a category.
 */
const LIST_CATEGORY = /^\{\s*([^{}()'"[\]]+?)\s*\}$/

/** The list a Category cell files a word under, or null where it names a category. */
export function listNameOf(category: string): string | null {
  const name = LIST_CATEGORY.exec(category.trim())?.[1]
  // Folded, because a list's name is the key a slot looks up — the Aliases
  // panel folds it the same way.
  return name ? name.toLowerCase() : null
}

/**
 * Every word list, for after the phrases: in the order the Aliases panel lists
 * them, each list's words in the order they are kept. **A list with no words is
 * a row with no word in it**, or a list somebody emptied — and the two Peri
 * ships empty, for contacts and a name — would not be in the sheet at all, and
 * replacing the board with it would take them away.
 */
export function listRows(aliases: AliasStore, shipped: Aliases = tableAliases()): SheetRow[] {
  return aliasNames(aliases, shipped).flatMap(name => {
    const category = `{${name}}`
    const words = aliasWords(aliases, name, shipped)
    return words.length ? words.map(phrase => ({ category, phrase, id: '' })) : [{ category, phrase: '', id: '' }]
  })
}

const ID_MARK = '#'

/** The rows as cells, header first. */
export function rowsToTable(rows: SheetRow[]): string[][] {
  return [SHEET_HEADER, ...rows.map(r => [r.category, r.phrase, r.id ? `${ID_MARK}${r.id}` : ''])]
}

// ── Writing text a spreadsheet will not rewrite ───────────────────────────────

/**
 * What a spreadsheet takes for a formula. **Guarded because a board is a file
 * people hand to each other**: a cell that opens as `=HYPERLINK(…)` in
 * somebody's Excel runs whatever it says. A markdown bullet — `- tea` — begins
 * with one of these too, and Excel would show it as an error rather than a
 * phrase.
 */
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * What a spreadsheet takes for a number, a date or a truth value, and rewrites:
 * `1/2` becomes the second of January, `007` becomes 7, `1e5` a hundred
 * thousand. None of Peri's own phrases looks like one; one somebody writes can.
 */
const NUMBERISH = /^(?:[-+]?[\d\s.,/:%$€£¥-]+|true|false|[-+]?\d+(?:\.\d+)?e[-+]?\d+)$/i

/**
 * An apostrophe in front, which is how a spreadsheet is told a cell is text —
 * and which is taken off again on the way back in, but only in front of
 * something it could have been guarding, so "'Tis the season" keeps its own.
 */
const guard = (cell: string, also: RegExp | null) =>
  FORMULA_START.test(cell) || (also?.test(cell) ?? false) ? `'${cell}` : cell

function unguard(cell: string): string {
  if (!cell.startsWith("'")) return cell
  const rest = cell.slice(1)
  return FORMULA_START.test(rest) || NUMBERISH.test(rest) ? rest : cell
}

function quote(cell: string, delimiter: string): string {
  return cell.includes(delimiter) || /["\r\n]/.test(cell) || cell !== cell.trim()
    ? `"${cell.replace(/"/g, '""')}"`
    : cell
}

/**
 * A CSV file. **A byte-order mark in front**, or Excel reads the file as the
 * machine's own code page and every accent comes out as two wrong characters;
 * CRLF between rows, which is what the format says and what Excel writes.
 *
 * Only formulas are guarded here, not numbers: Excel opening a CSV shows the
 * apostrophe rather than obeying it, so guarding every number-like phrase would
 * put an apostrophe in front of each one. That is what the Excel file is for.
 */
export function toCsv(table: string[][]): string {
  return `\uFEFF${table.map(row => row.map(c => quote(guard(c, null), ',')).join(',')).join('\r\n')}\r\n`
}

/**
 * Tab-separated, for pasting straight into Google Sheets or Excel. **Numbers
 * are guarded here as well as formulas**, because pasting — unlike opening a
 * file — obeys the apostrophe and hides it, so the cell shows the phrase and
 * copying it back gives the phrase.
 */
export function toTsv(table: string[][]): string {
  return table.map(row => row.map(c => quote(guard(c, NUMBERISH), '\t')).join('\t')).join('\n')
}

// ── Reading a table back ──────────────────────────────────────────────────────

/**
 * Which character separates the cells: whichever of tab, semicolon and comma
 * the first line holds most of, outside quotes. Excel writes semicolons
 * wherever the decimal point is a comma, and a sheet saved in Paris is a sheet
 * too.
 */
function detectDelimiter(text: string): string {
  const counts = { '\t': 0, ';': 0, ',': 0 }
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts]++
  }
  if (counts['\t'] > 0) return '\t'
  return counts[';'] > counts[','] ? ';' : ','
}

/**
 * Delimited text as rows of cells. Quotes, doubled quotes and newlines inside
 * quotes as the format has them, and forgiving about the rest — a quote in the
 * middle of a cell is a quote.
 *
 * `delimiter` is given where the source settles it: **anything pasted is
 * tab-separated**, since that is what every spreadsheet puts on the clipboard,
 * and guessing would split a single column of phrases at their commas.
 */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  let body = text.replace(/^\uFEFF/, '')
  // Excel's own way of naming the separator, on a line of its own at the top.
  const sep = /^sep=(.)\r?\n/i.exec(body)
  if (sep) body = body.slice(sep[0].length)
  const split = delimiter ?? sep?.[1] ?? detectDelimiter(body)

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let started = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (body[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (ch === '"' && !started) {
      quoted = true
      started = true
    } else if (ch === split) {
      row.push(cell)
      cell = ''
      started = false
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      started = false
      if (ch === '\r' && body[i + 1] === '\n') i++
    } else {
      cell += ch
      started = true
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/**
 * A text file's words, whichever encoding wrote them — or null for a file that
 * is not text at all.
 *
 * **UTF-8 first, and then the code page Excel on Windows saves a CSV in.**
 * "CSV (Comma delimited)" from Excel is not UTF-8: it is Windows-1252, and read
 * as UTF-8 every accent in it becomes a replacement character. Invalid UTF-8 is
 * the sign, so it is read strictly and read again the older way when it fails.
 * **UTF-16 where the file says so** — Excel's "Unicode Text" is tab-separated
 * UTF-16 behind a byte-order mark. **And a NUL byte anywhere else means binary**:
 * a PDF or a photograph chosen by mistake is refused rather than offered as a
 * thousand phrases of noise.
 */
export function textOf(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  if (bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const HEADERS = {
  phrase: ['phrase', 'phrases', 'text', 'words'],
  category: ['category', 'categories', 'tab'],
  id: ['id'],
}

/** An id as a sheet carries it, or nothing where the cell is not one. */
function readId(cell: string): string {
  const id = cell.trim().replace(/^#/, '')
  return /^[\w-]+$/.test(id) ? id : ''
}

/**
 * The word lists a sheet holds, by the name it gives each, and the words in the
 * order it has them. A list named with no words in it is here with none.
 */
export type SheetLists = Map<string, string[]>

export type ReadRows =
  | { ok: true; rows: SheetRow[]; lists: SheetLists; hasIds: boolean }
  | { ok: false; error: string }

/**
 * The rows out of a table.
 *
 * **Headed, the columns are found by name** and may be in any order, so a
 * sheet somebody rearranged still reads. **Unheaded, they are taken in the
 * order Peri writes them** — Category, Phrase, ID — except that a single
 * column is phrases, which is what somebody pasting a list of them has.
 */
export function readRows(table: string[][]): ReadRows {
  const lines = table.filter(r => r.some(c => c.trim() !== ''))
  if (lines.length === 0) return { ok: false, error: 'That sheet is empty.' }

  const head = lines[0]!.map(c => unguard(c).trim().toLowerCase())
  const find = (names: string[]) => head.findIndex(h => names.includes(h))
  let col: { phrase: number; category: number; id: number }
  let body: string[][]
  if (find(HEADERS.phrase) >= 0) {
    col = { phrase: find(HEADERS.phrase), category: find(HEADERS.category), id: find(HEADERS.id) }
    body = lines.slice(1)
  } else if (find(HEADERS.category) >= 0 || find(HEADERS.id) >= 0) {
    return {
      ok: false,
      error: 'That sheet has no Phrase column. Peri reads a column headed Phrase, with Category and ID beside it.',
    }
  } else {
    const width = Math.max(...lines.map(r => r.length))
    col = width === 1 ? { phrase: 0, category: -1, id: -1 } : { category: 0, phrase: 1, id: width >= 3 ? 2 : -1 }
    body = lines
  }

  if (body.length > MAX_ROWS)
    return {
      ok: false,
      error: `That sheet has ${body.length.toLocaleString()} rows, which is more than a board holds.`,
    }

  const cell = (r: string[], i: number) => (i >= 0 ? unguard(r[i] ?? '') : '')
  const rows: SheetRow[] = []
  const lists: SheetLists = new Map()
  for (const r of body) {
    const category = cell(r, col.category).trim()
    const id = readId(cell(r, col.id))
    const list = id ? null : listNameOf(category)
    if (list !== null) {
      // One line, and once: a list offers each word as a choice, and the same
      // word twice is a choice between two identical things.
      const word = cell(r, col.phrase).replace(/\s+/g, ' ').trim()
      lists.set(list, withWords(lists.get(list) ?? [], word ? [word] : []))
      continue
    }
    const phrase = cell(r, col.phrase).replace(/\r\n?/g, '\n').trim()
    if (phrase !== '') rows.push({ category, phrase, id })
  }
  if (rows.length === 0 && lists.size === 0) return { ok: false, error: 'That sheet has no phrases in it.' }
  return { ok: true, rows, lists, hasIds: rows.some(r => r.id !== '') }
}

// ── Putting a sheet onto the board ────────────────────────────────────────────

export type SheetMode = 'merge' | 'replace'

/** What an import will do, counted before anybody is asked to confirm it. */
export interface SheetPlan {
  added: number
  /** Reworded, moved onto or off the bar, or put in or taken out of a category. */
  changed: number
  /** Taken off the board once and named by the sheet again. */
  restored: number
  /** On the board already, exactly as the sheet has it — by ID or by wording. */
  unchanged: number
  /** Replace only: on the board and not in the sheet. */
  removed: number
}

export interface SheetBoard {
  store: PhraseStore
  /** Every phrase on the board, the emergency bar's included, as they are shown. */
  phrases: Phrase[]
  /** Every category with a tab, so a sheet's "greetings" finds "Greetings". */
  categories: string[]
}

/**
 * The store after putting a sheet onto the board, and what that did.
 *
 * Row by row, the first matching rule wins:
 *
 *  1. **An ID on the board** — the phrase takes the row's wording, and the
 *     categories it names.
 *  2. **An ID for a phrase taken off the board** — it comes back, as the row
 *     has it. Only Peri's own phrases can be taken off and brought back; one
 *     somebody wrote and deleted is gone, and its row is a new phrase.
 *  3. **The same wording in the same place** — Library, or the bar — as a
 *     phrase already there: that phrase, and nothing added. Matched as the
 *     editor matches, so a sheet read twice does not put everything on the
 *     board twice.
 *  4. **Anything else** is a new phrase, in Library and in the categories the
 *     row names. A row whose ID another row already used is the same phrase
 *     twice, which the first row has settled.
 *
 * **A category keeps its own order**: the order of the rows is not read, and
 * what the sheet puts in a category goes on its end. Adding never takes a
 * phrase out of a category; replacing makes each category hold what the sheet
 * says it holds, and takes away a category the sheet does not name.
 *
 * **Nothing moves onto or off the emergency bar unless somebody wrote it.** The
 * bar Peri ships is a fixed six, and a sheet putting one of them in Greetings —
 * or a greeting on Emergency — is taken as a wording change and no more.
 */
export function applySheet(
  sheet: SheetRow[],
  board: SheetBoard,
  mode: SheetMode,
  newId: () => string = newPhraseId,
): { store: PhraseStore; plan: SheetPlan } {
  // A sheet saved before the table was collapsed has a row for each copy of a
  // phrase, by the copy's own id; the dropped ones are the phrase they were
  // folded into now — see `foldFormerCopies`.
  const rows = sheet.map(row => (FORMER_IDS.has(row.id) ? { ...row, id: FORMER_IDS.get(row.id)! } : row))
  const { store } = board
  const replacing = mode === 'replace'
  const custom = store.custom.map(p => ({ ...p }))
  const customById = new Map(custom.map(p => [p.id, p]))
  const overrides = { ...store.overrides }
  const hidden = new Set(store.hidden)
  const onBoard = new Map(board.phrases.map(p => [p.id, p]))
  const place = (p: { category: string }) => (p.category === EMERGENCY ? EMERGENCY : LIBRARY)
  const keyed = new Map(board.phrases.map(p => [`${place(p)}\u0000${wordingKey(p.source)}`, p.id]))
  const shipped = new Map([...PHRASES, ...EMERGENCY_PHRASES].map(p => [p.id, p]))
  const plan: SheetPlan = { added: 0, changed: 0, restored: 0, unchanged: 0, removed: 0 }
  /** Every phrase the sheet names, which is what replacing keeps. */
  const inSheet = new Set<string>()
  /** The categories each phrase in the sheet is to be in, in the order the rows name them. */
  const wanted = new Map<string, string[]>()
  const onBar = (id: string) =>
    (customById.get(id)?.category ?? onBoard.get(id)?.category) === EMERGENCY ||
    shipped.get(id)?.category === EMERGENCY

  // Categories matched without regard to case, so a sheet typed in a hurry
  // puts "greetings" in the Greetings tab rather than beside it — and two
  // rows inventing one category in two spellings agree on the first.
  const spelled = new Map([...board.categories, EMERGENCY].map(c => [c.toLowerCase(), c]))
  const spell = (raw: string) => {
    const known = spelled.get(raw.toLowerCase())
    if (known) return known
    spelled.set(raw.toLowerCase(), raw)
    return raw
  }

  /** What a row puts a phrase in, and whether it puts it on the bar. */
  const read = (row: SheetRow) => {
    const named = namedIn(row.category).map(spell)
    return { toBar: named.includes(EMERGENCY), categories: named.filter(c => c !== EMERGENCY) }
  }

  /** Onto the bar or off it, the way the editor does it — only for a phrase somebody wrote. */
  const settle = (id: string, toBar: boolean) => {
    const mine = customById.get(id)
    if (!mine || (mine.category === EMERGENCY) === toBar) return false
    mine.category = toBar ? EMERGENCY : LIBRARY
    return true
  }

  const refer = (id: string, categories: string[]) => {
    if (onBar(id)) return
    wanted.set(id, [...new Set([...(wanted.get(id) ?? []), ...categories])])
  }
  const referredNow = (id: string) => Object.keys(store.members).filter(c => store.members[c].includes(id))
  const referencesChange = (id: string, categories: string[]) => {
    if (onBar(id)) return false
    const now = referredNow(id)
    return replacing
      ? now.length !== categories.length || now.some(c => !categories.includes(c))
      : categories.some(c => !now.includes(c))
  }

  for (const row of rows) {
    if (row.id && inSheet.has(row.id)) continue
    const { toBar, categories } = read(row)

    const current = row.id ? onBoard.get(row.id) : undefined
    if (current) {
      inSheet.add(current.id)
      const reworded = row.phrase !== current.source
      if (reworded) overrides[current.id] = row.phrase
      const moved = settle(current.id, toBar)
      const refiled = referencesChange(current.id, categories)
      refer(current.id, categories)
      if (reworded || moved || refiled) {
        // So a later row with the same new wording is found rather than added.
        keyed.set(
          `${toBar && customById.has(current.id) ? EMERGENCY : place(current)}\u0000${wordingKey(row.phrase)}`,
          current.id,
        )
        plan.changed++
      } else plan.unchanged++
      continue
    }

    const original = row.id && hidden.has(row.id) ? shipped.get(row.id) : undefined
    if (original) {
      hidden.delete(original.id)
      inSheet.add(original.id)
      if (row.phrase === original.source) delete overrides[original.id]
      else overrides[original.id] = row.phrase
      refer(original.id, categories)
      keyed.set(`${place(original)}\u0000${wordingKey(row.phrase)}`, original.id)
      plan.restored++
      continue
    }

    const where = toBar ? EMERGENCY : LIBRARY
    const same = keyed.get(`${where}\u0000${wordingKey(row.phrase)}`)
    if (same) {
      inSheet.add(same)
      if (referencesChange(same, categories)) plan.changed++
      else plan.unchanged++
      refer(same, categories)
      continue
    }

    // A phrase somebody wrote keeps the id it had, where the sheet came from
    // this board or another of theirs and nothing here has it — so reading the
    // same sheet twice finds it the second time rather than adding it again.
    const id = row.id.startsWith('custom-') && !customById.has(row.id) && !onBoard.has(row.id) ? row.id : newId()
    const added = { id, text: row.phrase, category: where }
    custom.push(added)
    customById.set(id, added)
    refer(id, categories)
    keyed.set(`${where}\u0000${wordingKey(row.phrase)}`, id)
    inSheet.add(id)
    plan.added++
  }

  const removed = new Set<string>()
  if (replacing) {
    for (const p of board.phrases) {
      if (inSheet.has(p.id)) continue
      removed.add(p.id)
      // Deleted if somebody wrote it, hidden if Peri shipped it — the rule the
      // bin follows, so replacing does nothing a dwell on the bin could not.
      if (customById.has(p.id)) {
        customById.delete(p.id)
        delete overrides[p.id]
      } else hidden.add(p.id)
    }
    plan.removed = removed.size
  }

  // Each category keeps its own order. Adding appends what the sheet puts in
  // it; replacing keeps, in their places, only the references the sheet still
  // names, appends the rest, and takes away a category no row names.
  const members: Record<string, string[]> = {}
  const named = new Set([...wanted.values()].flat())
  for (const [category, ids] of Object.entries(store.members)) {
    if (replacing && !named.has(category)) continue
    members[category] = ids.filter(id => !removed.has(id) && (!replacing || wanted.get(id)?.includes(category)))
  }
  for (const [id, categories] of wanted) {
    for (const category of categories) {
      const list = (members[category] ??= [])
      if (!list.includes(id)) list.push(id)
    }
  }
  // A phrase put on the bar is in no category.
  for (const category of Object.keys(members)) members[category] = members[category].filter(id => !onBar(id))

  return {
    store: {
      ...store,
      custom: custom.filter(p => customById.has(p.id)),
      overrides,
      hidden: [...hidden],
      members,
      categoryOrder: store.categoryOrder.filter(c => c in members),
      emergencyOrder: store.emergencyOrder.filter(id => !removed.has(id)),
      libraryOrder: store.libraryOrder.filter(id => !removed.has(id)),
    },
    plan,
  }
}

// ── Putting a sheet's word lists onto the board ───────────────────────────────

/** What a sheet does to the word lists, counted the way `SheetPlan` counts phrases. */
export interface ListPlan {
  /** Lists the sheet makes, or brings back after they were taken off. */
  added: number
  /** Lists that gain words or have one respelled — or, replacing, lose some. */
  changed: number
  unchanged: number
  /** Replace only: lists the sheet leaves out, which are taken off. */
  removed: number
  /** Replace only: words taken off the lists the sheet keeps. */
  wordsRemoved: number
}

const fold = (word: string) => word.toLowerCase()

/** `words` with `more` on the end, less any already there in whatever case. */
function withWords(words: string[], more: string[]): string[] {
  const seen = new Set(words.map(fold))
  const out = [...words]
  for (const word of more) {
    if (seen.has(fold(word))) continue
    seen.add(fold(word))
    out.push(word)
  }
  return out
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i])

/**
 * The lists after putting a sheet's onto them, and what that did.
 *
 *  * **A list is found by the name a phrase would find it by**: its own, then
 *    with an `s` on or off, so `{contact}` typed into a sheet is the `contacts`
 *    list — which is what a phrase writing `{contact}` gets.
 *  * **A word already on a list, in any case, is that word**, and takes the
 *    sheet's spelling of it: a list has no IDs, so the word is its own.
 *  * **Adding gains words and never loses one**, the rule a backup's merge
 *    follows for lists, and a list new to the board is made.
 *  * **A list taken off the board comes back as the sheet has it** — and where
 *    that is exactly the table's, it follows the table again, rather than being
 *    pinned to this release by a copy of its words.
 *  * **Replacing makes each list the sheet names hold its words and no
 *    others, and takes away the lists it does not name** — deleted if
 *    somebody made them, hidden if Peri shipped them, as the panel does. Only
 *    where the sheet names any list at all: one with none in it says nothing
 *    about them, and they are left as they are.
 *  * **The order of the rows is not read**, as it is not for phrases. A list
 *    keeps its own arrangement, and what the sheet adds goes on the end.
 */
export function applyLists(
  sheet: SheetLists,
  aliases: AliasStore,
  mode: SheetMode,
  shipped: Aliases = tableAliases(),
): { aliases: AliasStore; plan: ListPlan } {
  const names = new Set(aliasNames(aliases, shipped))
  const hidden = new Set(aliases.hidden)
  const lists = new Map(Object.entries(aliases.lists))
  const plan: ListPlan = { added: 0, changed: 0, unchanged: 0, removed: 0, wordsRemoved: 0 }

  const find = (name: string) => {
    const forms = [name, `${name}s`, name.replace(/s$/, '')]
    return forms.find(n => names.has(n)) ?? forms.find(n => hidden.has(n) && hasList(shipped, n)) ?? name
  }
  // Two names in the sheet can be one list — `{contact}` and `{contacts}` —
  // and are gathered before anything is counted, or it would be counted twice.
  const incoming = new Map<string, string[]>()
  for (const [name, words] of sheet) {
    const list = find(name)
    incoming.set(list, withWords(incoming.get(list) ?? [], words))
  }

  for (const [name, words] of incoming) {
    if (!names.has(name)) {
      hidden.delete(name)
      if (hasList(shipped, name) && same(shipped[name]!, words)) lists.delete(name)
      else lists.set(name, words)
      plan.added++
      continue
    }
    const current = aliasWords(aliases, name, shipped)
    const spelled = new Map(words.map(w => [fold(w), w]))
    const kept = mode === 'merge' ? current : current.filter(w => spelled.has(fold(w)))
    plan.wordsRemoved += current.length - kept.length
    const next = withWords(
      kept.map(w => spelled.get(fold(w)) ?? w),
      words,
    )
    if (same(next, current)) plan.unchanged++
    else {
      lists.set(name, next)
      plan.changed++
    }
  }

  if (mode === 'replace' && incoming.size > 0) {
    for (const name of names) {
      if (incoming.has(name)) continue
      lists.delete(name)
      if (hasList(shipped, name)) hidden.add(name)
      plan.removed++
    }
  }

  return { aliases: { lists: Object.fromEntries(lists), hidden: [...hidden] }, plan }
}

// ── Saying what an import will do ─────────────────────────────────────────────

const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`

/** What an import will do, in a line. */
export function describePlan(plan: SheetPlan, mode: SheetMode, lists?: ListPlan): string {
  const parts: string[] = []
  if (plan.added) parts.push(`${plan.added.toLocaleString()} new`)
  if (plan.changed) parts.push(`${plan.changed.toLocaleString()} changed`)
  if (plan.restored) parts.push(`${plan.restored.toLocaleString()} brought back`)
  if (mode === 'replace' && plan.removed) parts.push(`${plan.removed.toLocaleString()} removed`)
  if (lists?.added) parts.push(count(lists.added, 'new list', 'new lists'))
  if (lists?.changed) parts.push(`${count(lists.changed, 'list', 'lists')} changed`)
  if (mode === 'replace' && lists?.removed) parts.push(`${count(lists.removed, 'list', 'lists')} removed`)
  return parts.length ? parts.join(', ') : 'nothing to change'
}

/** Whether an import would change anything at all. */
export const planChanges = (plan: SheetPlan, mode: SheetMode, lists?: ListPlan) =>
  plan.added +
    plan.changed +
    plan.restored +
    (lists ? lists.added + lists.changed : 0) +
    (mode === 'replace' ? plan.removed + (lists ? lists.removed + lists.wordsRemoved : 0) : 0) >
  0

/**
 * What replacing takes away that adding would not — `2 phrases, 1 list and 4
 * words` — or null where it takes nothing, and there is no reason to offer it.
 */
export function describeRemovals(plan: SheetPlan, lists?: ListPlan): string | null {
  const parts = [
    plan.removed && count(plan.removed, 'phrase', 'phrases'),
    lists?.removed && count(lists.removed, 'list', 'lists'),
    lists?.wordsRemoved && count(lists.wordsRemoved, 'word', 'words'),
  ].filter((part): part is string => !!part)
  if (parts.length < 2) return parts[0] ?? null
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`
}

/** `peri-phrases-2026-09-21.csv`, for the day it was saved. */
export function sheetFilename(extension: 'csv' | 'xlsx', now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `peri-phrases-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`
}

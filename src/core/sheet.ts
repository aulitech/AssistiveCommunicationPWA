// The board as a spreadsheet, and a spreadsheet back onto the board.
//
// A backup is a diff for putting a device back the way it was; this is the
// other thing people ask for, **the whole board as rows somebody can read and
// edit** — in Excel, in Google Sheets, in anything that opens a table. Writing
// two hundred phrases is a job for a keyboard and an afternoon, usually done by
// whoever helps somebody set their board up, and a spreadsheet is where that
// person already knows how to work.
//
// One row a phrase: **Category, Phrase, ID**.
//
//  * **The phrase is its source**, slots and markup and all — `{pronouns}`,
//    `**Help**` — so a row read back is the phrase it was, not the words one
//    choice of its slots happened to show.
//  * **The ID is what makes the sheet an editor rather than a list.** A row
//    whose ID is on the board rewords or moves that phrase; a row without one
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

import { EMERGENCY_PHRASES, PHRASES, type Phrase } from './phrases'
import { IMPORTED_CATEGORY } from './backup'
import { displayCategory, newPhraseId, orderByIds, phraseKey, type PhraseStore } from './store'

const EMERGENCY = 'Emergency'

/** The columns, in the order Peri writes them. */
export const SHEET_HEADER = ['Category', 'Phrase', 'ID']

/** One row of a sheet. `id` is empty for a phrase the sheet adds. */
export interface SheetRow {
  category: string
  phrase: string
  id: string
}

/** A sheet longer than this is not a board, and reading it would stall the page. */
const MAX_ROWS = 20_000

// ── The board as rows ─────────────────────────────────────────────────────────

/**
 * Every phrase on the board, as it is arranged: the emergency bar first, since
 * it is the part somebody reaches for without reading, then each category in
 * the order its tabs are in, and each category in its own arrangement.
 */
export function boardRows(
  phrases: Phrase[],
  categories: string[],
  phraseOrder: Record<string, string[]>,
): SheetRow[] {
  const byCategory = new Map<string, Phrase[]>()
  for (const p of phrases) {
    const list = byCategory.get(p.category)
    if (list) list.push(p)
    else byCategory.set(p.category, [p])
  }
  const order = [
    EMERGENCY,
    ...categories.filter(c => c !== EMERGENCY),
    // Nothing on the board should be missing from the tabs, but a row lost
    // because a list disagreed would be a phrase lost from the sheet.
    ...[...byCategory.keys()].filter(c => c !== EMERGENCY && !categories.includes(c)),
  ]
  return order.flatMap(category =>
    orderByIds(byCategory.get(category) ?? [], phraseOrder[category] ?? []).map(p => ({
      category,
      phrase: p.source,
      id: p.id,
    })),
  )
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

export type ReadRows = { ok: true; rows: SheetRow[]; hasIds: boolean } | { ok: false; error: string }

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
  const rows = body
    .map(r => ({
      category: cell(r, col.category).trim(),
      phrase: cell(r, col.phrase).replace(/\r\n?/g, '\n').trim(),
      id: readId(cell(r, col.id)),
    }))
    .filter(r => r.phrase !== '')
  if (rows.length === 0) return { ok: false, error: 'That sheet has no phrases in it.' }
  return { ok: true, rows, hasIds: rows.some(r => r.id !== '') }
}

// ── Putting a sheet onto the board ────────────────────────────────────────────

export type SheetMode = 'merge' | 'replace'

/** What an import will do, counted before anybody is asked to confirm it. */
export interface SheetPlan {
  added: number
  /** Reworded, moved, or both. */
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
 *  1. **An ID on the board** — the phrase takes the row's wording and category.
 *  2. **An ID for a phrase taken off the board** — it comes back, as the row
 *     has it. Only Peri's own phrases can be taken off and brought back; one
 *     somebody wrote and deleted is gone, and its row is a new phrase.
 *  3. **The same wording in the same category** as a phrase already there —
 *     that phrase, and nothing added. Matched as the editor matches, so a sheet
 *     read twice does not put everything on the board twice.
 *  4. **Anything else** is a new phrase. A row naming no category goes under
 *     Imported, and a row whose ID another row already used is the same phrase
 *     twice, which the first row has settled.
 *
 * **Nothing moves onto or off the emergency bar unless somebody wrote it.** The
 * bar Peri ships is a fixed six, and a sheet filing one of them under Greetings
 * — or a greeting under Emergency — is taken as a wording change and no more.
 */
export function applySheet(
  rows: SheetRow[],
  board: SheetBoard,
  mode: SheetMode,
  newId: () => string = newPhraseId,
): { store: PhraseStore; plan: SheetPlan } {
  const { store } = board
  const custom = store.custom.map(p => ({ ...p }))
  const customById = new Map(custom.map(p => [p.id, p]))
  const overrides = { ...store.overrides }
  const categoryOverrides = { ...store.categoryOverrides }
  const hidden = new Set(store.hidden)
  const categories = new Set(store.categories)
  const onBoard = new Map(board.phrases.map(p => [p.id, p]))
  const keyed = new Map(board.phrases.map(p => [phraseKey(p.source, p.category), p.id]))
  const shipped = new Map([...PHRASES, ...EMERGENCY_PHRASES].map(p => [p.id, p]))
  const plan: SheetPlan = { added: 0, changed: 0, restored: 0, unchanged: 0, removed: 0 }
  /** Every phrase the sheet names, which is what replacing keeps. */
  const inSheet = new Set<string>()

  // Categories matched without regard to case, so a sheet typed in a hurry
  // files "greetings" under the Greetings tab rather than beside it — and two
  // rows inventing one category in two spellings agree on the first.
  const spelled = new Map([...board.categories, EMERGENCY].map(c => [c.toLowerCase(), c]))
  const categoryOf = (raw: string) => {
    const name = raw.trim() || IMPORTED_CATEGORY
    const known = spelled.get(name.toLowerCase())
    if (known) return known
    spelled.set(name.toLowerCase(), name)
    return name
  }

  const canMove = (id: string, from: string, to: string) =>
    from === to ? false : from !== EMERGENCY && to !== EMERGENCY ? true : customById.has(id)

  /** Filed under another category, the way the editor files one. */
  const move = (id: string, to: string) => {
    const mine = customById.get(id)
    // A phrase somebody wrote carries its category itself, which is also what
    // puts it on the emergency bar or takes it off.
    if (mine) {
      mine.category = to
      delete categoryOverrides[id]
    } else categoryOverrides[id] = to
    if (to !== EMERGENCY) categories.add(to)
  }

  for (const row of rows) {
    const category = categoryOf(row.category)
    if (row.id && inSheet.has(row.id)) continue

    const current = row.id ? onBoard.get(row.id) : undefined
    if (current) {
      inSheet.add(current.id)
      const reworded = row.phrase !== current.source
      const moved = canMove(current.id, current.category, category)
      if (reworded) overrides[current.id] = row.phrase
      if (moved) move(current.id, category)
      if (reworded || moved) {
        // So a later row with the same new wording is found rather than added.
        keyed.set(phraseKey(row.phrase, moved ? category : current.category), current.id)
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
      const was =
        original.category === EMERGENCY
          ? EMERGENCY
          : (categoryOverrides[original.id] ?? displayCategory(original.category, store.categoryRenames))
      if (canMove(original.id, was, category)) move(original.id, category)
      keyed.set(phraseKey(row.phrase, category), original.id)
      plan.restored++
      continue
    }

    const key = phraseKey(row.phrase, category)
    const same = keyed.get(key)
    if (same) {
      inSheet.add(same)
      plan.unchanged++
      continue
    }

    // A phrase somebody wrote keeps the id it had, where the sheet came from
    // this board or another of theirs and nothing here has it — so reading the
    // same sheet twice finds it the second time rather than adding it again.
    const id = row.id.startsWith('custom-') && !customById.has(row.id) && !onBoard.has(row.id) ? row.id : newId()
    const added = { id, text: row.phrase, category }
    custom.push(added)
    customById.set(id, added)
    if (category !== EMERGENCY) categories.add(category)
    keyed.set(key, id)
    inSheet.add(id)
    plan.added++
  }

  const removed = new Set<string>()
  if (mode === 'replace') {
    for (const p of board.phrases) {
      if (inSheet.has(p.id)) continue
      removed.add(p.id)
      // Deleted if somebody wrote it, hidden if Peri shipped it — the rule the
      // bin follows, so replacing does nothing a dwell on the bin could not.
      if (customById.has(p.id)) {
        customById.delete(p.id)
        delete overrides[p.id]
        delete categoryOverrides[p.id]
      } else hidden.add(p.id)
    }
    plan.removed = removed.size
  }

  // Arrangements tidied of whatever went, as the bin tidies them: an id naming
  // nothing is harmless, but a store that only accumulates is one nobody can
  // read later.
  const phraseOrder: Record<string, string[]> = {}
  for (const [category, ids] of Object.entries(store.phraseOrder)) {
    const kept = ids.filter(id => !removed.has(id))
    if (kept.length > 0) phraseOrder[category] = kept
  }

  return {
    store: {
      ...store,
      custom: custom.filter(p => customById.has(p.id)),
      overrides,
      categoryOverrides,
      hidden: [...hidden],
      categories: [...categories],
      emergencyOrder: store.emergencyOrder.filter(id => !removed.has(id)),
      phraseOrder,
    },
    plan,
  }
}

/** What an import will do, in a line. */
export function describePlan(plan: SheetPlan, mode: SheetMode): string {
  const parts: string[] = []
  if (plan.added) parts.push(`${plan.added.toLocaleString()} new`)
  if (plan.changed) parts.push(`${plan.changed.toLocaleString()} changed`)
  if (plan.restored) parts.push(`${plan.restored.toLocaleString()} brought back`)
  if (mode === 'replace' && plan.removed) parts.push(`${plan.removed.toLocaleString()} removed`)
  return parts.length ? parts.join(', ') : 'nothing to change'
}

/** Whether an import would change anything at all. */
export const planChanges = (plan: SheetPlan, mode: SheetMode) =>
  plan.added + plan.changed + plan.restored + (mode === 'replace' ? plan.removed : 0) > 0

/** `peri-phrases-2026-09-21.csv`, for the day it was saved. */
export function sheetFilename(extension: 'csv' | 'xlsx', now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `peri-phrases-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`
}

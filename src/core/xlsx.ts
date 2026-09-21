// An Excel workbook in and out, as a table of text — one sheet, every cell a
// string. What `core/sheet.ts` needs from a spreadsheet file and not a cell more.
//
// **Written by hand rather than with a library**, because the job is small and
// the libraries are not. An .xlsx is a zip of a handful of XML files, and a board
// is two or three columns of text: writing one is a few templates and a zip with
// nothing compressed in it, and reading one is finding the first sheet and its
// strings. The library that does all of Excel is several hundred kilobytes, and
// the one most people reach for stopped publishing fixes to npm.
//
// Three things decide how it is written:
//
//  * **Every cell written is text.** `inlineStr` cells, never numbers or
//    formulas, so a phrase that looks like a date or a sum arrives in Excel as
//    the words somebody wrote. This is the reason to offer an Excel file at all
//    beside CSV, which Excel reads by guessing.
//  * **Reading is forgiving about who wrote the file.** Excel, Google Sheets,
//    Numbers and LibreOffice all write this format and none of them the same
//    way: shared strings or inline ones, rich-text runs, `_x000D_` escapes,
//    namespace prefixes, absolute paths in the relationships. Every cell comes
//    back as the text it shows.
//  * **Nothing throws a stack trace at the user.** A file that is not a
//    workbook is a `SheetFileError` with a sentence in it saying what to do.

/** A spreadsheet file Peri cannot read, with the sentence to show about it. */
export class SheetFileError extends Error {}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ── Writing ───────────────────────────────────────────────────────────────────

const encoder = new TextEncoder()

/**
 * Text as XML allows it. Most control characters cannot appear in XML at all,
 * and a carriage return would be folded into the newline beside it by whatever
 * reads the file back, so it goes as a character reference.
 */
function escapeXml(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\r/g, '&#13;')
  )
}

/** A column's letters: 0 is A, 25 is Z, 26 is AA. */
function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

/**
 * Three cell styles: plain, the header's bold, and text that wraps — a phrase
 * can run over several lines, and one that did not wrap would be a single line
 * running off the side of the sheet.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

const workbook = (sheetName: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`

export interface XlsxOptions {
  /** The tab's name. Excel allows 31 characters and none of `:\/?*[]`. */
  sheetName?: string
  /** Each column's width, in characters. */
  widths?: number[]
  /** Columns whose text wraps, by index. */
  wrap?: number[]
}

function worksheet(table: string[][], { widths = [], wrap = [] }: XlsxOptions): string {
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const rows = table
    .map((cells, r) => {
      const xml = cells
        .map((text, c) => {
          if (text === '') return ''
          // The header is bold; a wrapping column wraps below it.
          const style = r === 0 ? 1 : wrap.includes(c) ? 2 : 0
          return `<c r="${columnName(c)}${r + 1}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${xml}</row>`
    })
    .join('')
  // The header row stays put while the sheet scrolls under it: a board is two
  // and a half thousand rows, and a column nobody can name is a column nobody
  // can edit with confidence.
  const frozen =
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${frozen}${cols}<sheetData>${rows}</sheetData></worksheet>`
}

/** A workbook of one sheet, every cell text, the first row a bold header. */
export function writeXlsx(table: string[][], options: XlsxOptions = {}): Uint8Array<ArrayBuffer> {
  const name = (options.sheetName ?? 'Sheet1').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet1'
  return zip([
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', workbook(name)],
    ['xl/_rels/workbook.xml.rels', WORKBOOK_RELS],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', worksheet(table, options)],
  ])
}

// ── The zip it is wrapped in ──────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32, which every zip entry carries and Excel checks. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Files into a zip, **stored rather than compressed**. A board's workbook is a
 * few hundred kilobytes of XML, which is nothing to a download and saves writing
 * a compressor; every reader of the format takes stored entries. Dated to the
 * format's own epoch, so the same board writes the same bytes.
 */
function zip(files: [name: string, text: string][]): Uint8Array<ArrayBuffer> {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(text)
    const crc = crc32(data)

    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const l = new DataView(local.buffer)
    l.setUint32(0, 0x04034b50, true)
    l.setUint16(4, 20, true) // version needed
    l.setUint16(6, 0x0800, true) // names are UTF-8
    l.setUint16(8, 0, true) // stored
    l.setUint16(10, 0, true) // 00:00
    l.setUint16(12, 0x21, true) // 1980-01-01
    l.setUint32(14, crc, true)
    l.setUint32(18, data.length, true)
    l.setUint32(22, data.length, true)
    l.setUint16(26, nameBytes.length, true)
    l.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)

    const central = new Uint8Array(46 + nameBytes.length)
    const c = new DataView(central.buffer)
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true) // version made by
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, 0, true)
    c.setUint16(14, 0x21, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, data.length, true)
    c.setUint32(24, data.length, true)
    c.setUint16(28, nameBytes.length, true)
    c.setUint32(42, offset, true)
    central.set(nameBytes, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }

  const directorySize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, files.length, true)
  e.setUint16(10, files.length, true)
  e.setUint32(12, directorySize, true)
  e.setUint32(16, offset, true)

  const out = new Uint8Array(offset + directorySize + end.length)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

// ── Reading ───────────────────────────────────────────────────────────────────

const decoder = new TextDecoder()

/** Whether these bytes are a zip at all — which an .xlsx is, and a CSV is not. */
export const isZip = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04

/**
 * The binary Excel format from before 2007, and the wrapper Excel puts round a
 * workbook with a password. Neither can be read here, and both are worth
 * naming: "not a spreadsheet" would be untrue of the first and baffling for the
 * second.
 */
export const isCompoundFile = (bytes: Uint8Array) =>
  bytes.length >= 8 && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => bytes[i] === b)

const NOT_A_WORKBOOK =
  'That file is not a spreadsheet Peri can read. Save it as an Excel workbook (.xlsx) or as CSV and try again.'

interface Entry {
  method: number
  compressedSize: number
  localOffset: number
}

/** The zip's table of contents, by name. */
function entries(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end record is the last thing in the file, followed only by a comment of
  // at most 65,535 bytes — so it is searched for backwards, no further than that.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new SheetFileError(NOT_A_WORKBOOK)

  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const found = new Map<string, Entry>()
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new SheetFileError(NOT_A_WORKBOOK)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    found.set(name, {
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      localOffset: view.getUint32(at + 42, true),
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return found
}

/**
 * One file out of the zip, as text.
 *
 * The sizes come from the table of contents rather than from the file's own
 * header, which a writer streaming its output leaves as zeros and fills in
 * after the data. Deflate is undone by the browser's own `DecompressionStream`,
 * which every browser this app runs in has.
 */
async function readEntry(bytes: Uint8Array, all: Map<string, Entry>, name: string): Promise<string | null> {
  const entry = all.get(name)
  if (!entry) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const header = entry.localOffset
  if (view.getUint32(header, true) !== 0x04034b50) throw new SheetFileError(NOT_A_WORKBOOK)
  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true)
  const data = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return decoder.decode(data)
  if (entry.method !== 8) throw new SheetFileError(NOT_A_WORKBOOK)
  try {
    // A copy, because a view into the middle of the file is not a body a
    // Response will take.
    const stream = new Response(data.slice()).body!.pipeThrough(new DecompressionStream('deflate-raw'))
    return await new Response(stream).text()
  } catch {
    throw new SheetFileError(NOT_A_WORKBOOK)
  }
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new SheetFileError(NOT_A_WORKBOOK)
  return doc
}

/**
 * Elements by their local name, whatever prefix the writer gave them — most
 * write `<c>` in the default namespace, and a few write `<x:c>`.
 */
const byName = (node: Document | Element, name: string) => [...node.getElementsByTagNameNS('*', name)]

/** A path in a relationships file, relative to the part it belongs to or from the root. */
function resolve(target: string, base: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop()
    else if (piece !== '.') parts.push(piece)
  }
  return parts.join('/')
}

/** Excel's escape for a character XML could not carry: `_x000D_` is a carriage return. */
const unescapeExcel = (text: string) =>
  text.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

/**
 * The text of a shared or inline string: its own `<t>`, or its rich-text runs
 * joined. Not every `<t>` inside it — a phonetic guide (`<rPh>`) carries text of
 * its own that is not part of what the cell shows.
 */
function stringText(item: Element): string {
  let text = ''
  for (const child of item.children) {
    if (child.localName === 't') text += child.textContent ?? ''
    else if (child.localName === 'r') for (const t of byName(child, 't')) text += t.textContent ?? ''
  }
  return unescapeExcel(text)
}

/** "BC12" to column 54. */
function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref.toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

/**
 * The first sheet of a workbook as rows of text, exactly as each cell shows.
 * **The first in the workbook's own order**, which is the tab on the left, and
 * not whichever sheet file happens to be called `sheet1`.
 */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  if (isCompoundFile(bytes))
    throw new SheetFileError(
      'That is an older Excel file, or one with a password on it. Save it as an Excel workbook (.xlsx) or as CSV and try again.',
    )
  if (!isZip(bytes)) throw new SheetFileError(NOT_A_WORKBOOK)

  const all = entries(bytes)
  const book = await readEntry(bytes, all, 'xl/workbook.xml')
  if (book === null) throw new SheetFileError(NOT_A_WORKBOOK)

  const rels = new Map<string, { type: string; target: string }>()
  const relsText = await readEntry(bytes, all, 'xl/_rels/workbook.xml.rels')
  if (relsText !== null) {
    for (const rel of byName(parseXml(relsText), 'Relationship')) {
      rels.set(rel.getAttribute('Id') ?? '', {
        type: rel.getAttribute('Type') ?? '',
        target: resolve(rel.getAttribute('Target') ?? '', 'xl/workbook.xml'),
      })
    }
  }

  const firstSheet = byName(parseXml(book), 'sheet')[0]
  const sheetRel = firstSheet
    ? rels.get(
        firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ??
          firstSheet.getAttribute('r:id') ??
          '',
      )
    : undefined
  const sheetPath = sheetRel?.target ?? 'xl/worksheets/sheet1.xml'
  const sheetText = await readEntry(bytes, all, sheetPath)
  if (sheetText === null) throw new SheetFileError(NOT_A_WORKBOOK)

  const sharedPath =
    [...rels.values()].find(r => r.type.endsWith('/sharedStrings'))?.target ?? 'xl/sharedStrings.xml'
  const sharedText = await readEntry(bytes, all, sharedPath)
  const shared = sharedText === null ? [] : byName(parseXml(sharedText), 'si').map(stringText)

  const table: string[][] = []
  for (const row of byName(parseXml(sheetText), 'row')) {
    const cells: string[] = []
    for (const cell of byName(row, 'c')) {
      const ref = cell.getAttribute('r')
      const at = ref ? columnIndex(ref) : cells.length
      const value = byName(cell, 'v')[0]?.textContent ?? ''
      const text = cellText(cell, cell.getAttribute('t') ?? 'n', value, shared)
      while (cells.length < at) cells.push('')
      cells[at] = text
    }
    table.push(cells)
  }
  return table
}

function cellText(cell: Element, type: string, value: string, shared: string[]): string {
  switch (type) {
    case 's':
      return shared[Number(value)] ?? ''
    case 'inlineStr': {
      const inline = byName(cell, 'is')[0]
      return inline ? stringText(inline) : ''
    }
    case 'str':
      return unescapeExcel(value)
    case 'b':
      return value === '1' ? 'TRUE' : value === '0' ? 'FALSE' : ''
    case 'e':
      return ''
    default: {
      // A number, written the way the file stored it. Excel stores 3.14 as
      // 3.1400000000000001, which nobody typed; the shortest form that means
      // the same number is what the cell shows.
      if (value === '') return ''
      const n = Number(value)
      return Number.isFinite(n) ? String(n) : value
    }
  }
}

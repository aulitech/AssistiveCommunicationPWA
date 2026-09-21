import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { crc32 as nodeCrc32, deflateRawSync } from 'node:zlib'
import { crc32, isZip, readXlsx, SheetFileError, writeXlsx } from '../../src/core/xlsx'

// A workbook in and out, as a table of text.
//
// Most of this file is about reading files Peri did not write, because that is
// where it can go wrong: Excel, Google Sheets, Numbers and LibreOffice all
// write the format, and no two the same way. `fixtures/openpyxl.xlsx` was
// written by a real library; the rest are built here, part by part, to be the
// shapes Excel itself writes.

/** Trailing empty cells, which no spreadsheet writes, taken off for comparing. */
const trimmed = (table: string[][]) =>
  table.map(row => {
    const cells = [...row]
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    return cells
  })

/**
 * A zip built the way Excel builds one: every entry deflated, and — where asked
 * — streamed, with the sizes left out of the entry's own header and written
 * only into the table at the end.
 */
function excelZip(files: Record<string, string>, { streamed = false, method = 8 } = {}): Uint8Array {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8')
    const data = method === 8 ? deflateRawSync(raw) : raw
    const crc = nodeCrc32(raw)
    const nameBytes = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(streamed ? 0x0008 : 0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(streamed ? 0 : crc, 14)
    local.writeUInt32LE(streamed ? 0 : data.length, 18)
    local.writeUInt32LE(streamed ? 0 : raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const descriptor = Buffer.alloc(streamed ? 16 : 0)
    if (streamed) {
      descriptor.writeUInt32LE(0x08074b50, 0)
      descriptor.writeUInt32LE(crc, 4)
      descriptor.writeUInt32LE(data.length, 8)
      descriptor.writeUInt32LE(raw.length, 12)
    }
    parts.push(local, nameBytes, data, descriptor)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(streamed ? 0x0008 : 0, 8)
    entry.writeUInt16LE(method, 10)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += 30 + nameBytes.length + data.length + descriptor.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...parts, directory, end]))
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

describe('a workbook Peri writes', () => {
  it('reads back exactly as it was written', async () => {
    const table = [
      ['Category', 'Phrase', 'ID'],
      ['Greetings', 'Good morning', '#1x4f9k2'],
      ['Food', "Café au lait, s'il vous plaît", ''],
      ['Feelings', "I'm happy 😀", ''],
      ['Notes', 'Line one\nLine two', ''],
      ['Notes', 'Carriage\r\nreturn', ''],
      ['Food', 'Fish & chips <hot> "now"', ''],
      ['Spacing', '  spaced out  ', ''],
      ['', 'No category here', '#em-0'],
      ['Sums', '=1+1', ''],
      ['Dates', '1/2', ''],
    ]
    expect(trimmed(await readXlsx(writeXlsx(table)))).toEqual(trimmed(table))
  })

  // A cell's letters run past Z the way a spreadsheet's columns do, or the
  // twenty-seventh column would land on top of the first.
  it('puts a cell past column Z where it belongs', async () => {
    const wide = [Array.from({ length: 30 }, (_, i) => `c${i}`)]
    expect(await readXlsx(writeXlsx(wide))).toEqual(wide)
  })

  // XML cannot carry most control characters at all, and a file holding one is
  // a file Excel refuses to open. They are nothing anybody would see.
  it('leaves out the characters XML cannot carry', async () => {
    expect(await readXlsx(writeXlsx([['a\u0007b\u0000c']]))).toEqual([['abc']])
  })

  /**
   * **Every cell written is text**, which is the whole reason to offer an Excel
   * file beside CSV: Excel reads a CSV by guessing, and guesses that `1/2` is
   * the second of January.
   */
  it('writes every cell as text, never as a number or a formula', () => {
    const sheet = new TextDecoder().decode(writeXlsx([['1/2', '=1+1', '42']]))
    expect(sheet).toContain('t="inlineStr"')
    expect(sheet).not.toMatch(/<f>|t="n"|<v>/)
  })

  // Excel checks every entry's checksum, and calls a file with one wrong
  // damaged. Checked here against Node's own CRC rather than against the one
  // under test.
  it('is a zip Excel will open: every entry carries its own checksum', () => {
    const bytes = writeXlsx([
      ['Category', 'Phrase'],
      ['Food', 'Tea please'],
    ])
    expect(isZip(bytes)).toBe(true)
    const view = new DataView(bytes.buffer)
    let at = view.getUint32(bytes.length - 22 + 16, true)
    let checked = 0
    while (view.getUint32(at, true) === 0x02014b50) {
      const nameLength = view.getUint16(at + 28, true)
      const size = view.getUint32(at + 20, true)
      const local = view.getUint32(at + 42, true)
      const start = local + 30 + view.getUint16(local + 26, true)
      expect(view.getUint32(at + 16, true)).toBe(nodeCrc32(bytes.subarray(start, start + size)))
      at += 46 + nameLength
      checked++
    }
    expect(checked).toBe(6)
  })

  it('computes the checksum every zip uses', () => {
    for (const text of ['', 'a', 'The quick brown fox', 'Café 😀']) {
      const bytes = new TextEncoder().encode(text)
      expect(crc32(bytes), text).toBe(nodeCrc32(bytes))
    }
  })

  // The same board writes the same bytes: nothing in the file says when.
  it('writes the same bytes for the same table', () => {
    expect(writeXlsx([['a', 'b']])).toEqual(writeXlsx([['a', 'b']]))
  })
})

describe('a workbook somebody else wrote', () => {
  // Deflated, inline strings, rich-text runs, a number, a truth value, a cell
  // missing from the middle of a row, and a second sheet that is not the one
  // wanted.
  it('reads one written by a real spreadsheet library', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(__dirname, 'fixtures/openpyxl.xlsx')))
    expect(trimmed(await readXlsx(bytes))).toEqual([
      ['Category', 'Phrase', 'ID'],
      ['Greetings', 'Good morning', '#1x4f9k2'],
      ['Food', "Café au lait, s'il vous plaît"],
      ['Feelings', "I'm happy 😀"],
      ['Notes', 'Line one\nLine two'],
      ['Food', 'Fish & chips <hot>'],
      ['', 'No category here'],
      ['Numbers', '42'],
      ['Truth', 'TRUE'],
      ['Spacing', '  spaced out  '],
      ['Styled', 'Bold and plain'],
      ['Guarded', '=not a formula'],
    ])
  })

  /**
   * The shape Excel writes: shared strings, some of them in rich-text runs and
   * one carrying a phonetic guide that is not part of what the cell shows; a
   * carriage return written as `_x000D_`; cells missing from the middle of a
   * row; a formula's cached text; an error; and a number stored the long way.
   */
  it('reads the shared strings Excel writes, as each cell shows them', async () => {
    const bytes = excelZip({
      'xl/workbook.xml': `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Board" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
      'xl/sharedStrings.xml': `<sst xmlns="${MAIN}" count="4" uniqueCount="4"><si><t>Category</t></si><si><t>Phrase</t></si><si><r><rPr><b/></rPr><t>Help</t></r><r><t xml:space="preserve"> me</t></r></si><si><t>東京</t><rPh sb="0" eb="2"><t>トウキョウ</t></rPh></si><si><t>Two_x000D_
lines</t></si></sst>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="B2" t="s"><v>2</v></c><c r="D2" t="s"><v>3</v></c></row><row r="3"><c r="A3" t="str"><f>A1</f><v>Category</v></c><c r="B3" t="s"><v>4</v></c><c r="C3" t="e"><v>#REF!</v></c><c r="D3"><v>3.1400000000000001</v></c></row></sheetData></worksheet>`,
    })
    expect(trimmed(await readXlsx(bytes))).toEqual([
      ['Category', 'Phrase'],
      ['', 'Help me', '', '東京'],
      ['Category', 'Two\r\nlines', '', '3.14'],
    ])
  })

  /**
   * **The first sheet is the tab on the left**, in the workbook's own order —
   * not whichever file happens to be called `sheet1`. A writer that names its
   * files by when they were made and a person who dragged a tab to the front
   * both put those two apart.
   */
  it('reads the first sheet in the workbook, whatever its file is called', async () => {
    const bytes = excelZip({
      'xl/workbook.xml': `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Phrases" sheetId="2" r:id="rId2"/><sheet name="Notes" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      // Absolute, as some writers put it.
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="/xl/worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Notes</t></is></c></row></sheetData></worksheet>`,
      'xl/worksheets/sheet2.xml': `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Phrases</t></is></c></row></sheetData></worksheet>`,
    })
    expect(await readXlsx(bytes)).toEqual([['Phrases']])
  })

  // A few writers put every element behind a prefix rather than in the default
  // namespace. The same cells, the same text.
  it('reads a workbook whose elements carry a namespace prefix', async () => {
    const bytes = excelZip({
      'xl/workbook.xml': `<x:workbook xmlns:x="${MAIN}" xmlns:r="${REL}"><x:sheets><x:sheet name="A" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      'xl/worksheets/sheet1.xml': `<x:worksheet xmlns:x="${MAIN}"><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Tea</x:t></x:is></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>please</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>`,
    })
    expect(await readXlsx(bytes)).toEqual([['Tea', 'please']])
  })

  /**
   * **The sizes come from the table at the end**, not from the entry's own
   * header: a writer streaming its output leaves those as zeros and writes them
   * after the data, and a reader trusting the header reads nothing.
   */
  it('reads entries whose sizes were written after them', async () => {
    const bytes = excelZip(
      {
        'xl/workbook.xml': `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
        'xl/worksheets/sheet1.xml': `<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Streamed</t></is></c></row></sheetData></worksheet>`,
      },
      { streamed: true },
    )
    expect(await readXlsx(bytes)).toEqual([['Streamed']])
  })
})

/**
 * **Nothing throws a stack trace at the user.** Every file that is not a
 * workbook this can read says so in a sentence, and says what to do instead.
 */
describe('a file that is not a workbook', () => {
  const refusal = async (bytes: Uint8Array) => {
    try {
      await readXlsx(bytes)
    } catch (e) {
      expect(e, 'a failure that is not a sentence for the user').toBeInstanceOf(SheetFileError)
      return (e as Error).message
    }
    throw new Error('read something that is not a workbook')
  }

  it('says what to save it as', async () => {
    expect(await refusal(new TextEncoder().encode('Category,Phrase\nFood,Tea'))).toMatch(/\.xlsx.*CSV/)
  })

  // The binary format from before 2007, and the wrapper a password puts round a
  // workbook, begin the same way — and "not a spreadsheet" would be untrue of
  // the one and baffling for the other.
  it('names an older Excel file, or one with a password, for what it is', async () => {
    const legacy = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])
    expect(await refusal(legacy)).toMatch(/older Excel file, or one with a password/)
  })

  it('refuses a zip that holds no workbook — a Numbers file, say', async () => {
    expect(await refusal(excelZip({ 'Index/Document.iwa': 'not a workbook' }))).toMatch(/\.xlsx/)
  })

  it('refuses a zip cut short', async () => {
    const whole = writeXlsx([['a']])
    expect(await refusal(whole.subarray(0, whole.length - 30))).toMatch(/\.xlsx/)
  })

  it('refuses compression it does not know', async () => {
    const bytes = excelZip(
      {
        'xl/workbook.xml': `<workbook xmlns="${MAIN}"><sheets/></workbook>`,
      },
      { method: 12 },
    )
    expect(await refusal(bytes)).toMatch(/\.xlsx/)
  })
})

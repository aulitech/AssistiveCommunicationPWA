import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { parseDelimited } from '../../src/core/sheet'
import { readXlsx } from '../../src/core/xlsx'
import { downloads, setClipboardText, unmeasuredGrid } from '../setup'

// The board as a spreadsheet, through the real board: out as a CSV, an Excel
// workbook and a paste for Google Sheets, and back in by a file or a paste.
//
// `tests/core/sheet.test.ts` holds the rules; this holds that the screen puts
// the whole of the real board in the file, and that a sheet brought back lands
// on the board somebody is looking at.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]

const settle = () => act(() => void vi.advanceTimersByTime(50))

let pointerAt = 0
function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
  fireEvent.click(el)
  settle()
}

/** A rest rather than a click: the dwell, which carries no press. */
function rest(el: Element | null | undefined) {
  if (!el) throw new Error('tried to rest on something that is not rendered')
  fireEvent.pointerEnter(el)
  act(() => void vi.advanceTimersByTime(5000))
}

/** The file readers are promise-based; fake timers do not hold up microtasks. */
async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => void (await Promise.resolve()))
  settle()
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'
const MINE = { id: 'custom-mine', text: 'Put the kettle on', category: 'Kitchen' }
const ALSO = { id: 'custom-also', text: 'Open the window', category: 'Kitchen' }

function renderApp(custom = [MINE, ALSO]) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  localStorage.setItem(STORE_KEY, JSON.stringify({ custom }))
  container = render(<App />).container
  settle()
}

/** The app again, over whatever the test has just put in storage. */
function cleanupAndRender() {
  cleanup()
  container = render(<App />).container
  settle()
}

function openBackup() {
  click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Backup & sharing'))
}

const btn = (label: string) => $$('.panel-btn').find(b => b.getAttribute('aria-label') === label)
/** The spreadsheet's own file input, told from the backup's by what it accepts. */
const sheetInput = () => $$<HTMLInputElement>('input[type="file"]').find(i => i.accept.includes('.xlsx'))!
const summary = () => $('.sheet-incoming .backup-summary')?.textContent ?? ''
const note = () => $('.sheet-incoming .backup-note')?.textContent ?? ''
const cellTexts = () => $$('.phrase-cell').map(c => c.textContent)
const toast = () => $('.toast')?.textContent ?? ''

/** Dwells "Save as CSV" and reads back the table in the file that came out. */
function savedCsv() {
  click(btn('Save as CSV'))
  const file = downloads[downloads.length - 1]!
  return { ...file, table: parseDelimited(file.text) }
}

/** A table as a CSV, quoted where it has to be. */
const csvOf = (table: string[][]) =>
  table.map(r => r.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')

async function choose(name: string, contents: BlobPart, type = 'text/csv') {
  fireEvent.change(sheetInput(), { target: { files: [new File([contents], name, { type })] } })
  await flush()
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the board as a spreadsheet', () => {
  it('is offered under Backup & sharing, three ways out and two back in', () => {
    renderApp()
    openBackup()
    for (const label of [
      'Save for Excel',
      'Save as CSV',
      'Copy for Sheets',
      'Choose a spreadsheet',
      'Paste from Sheets',
    ])
      expect(btn(label), label).toBeDefined()
  })

  /**
   * **The whole board, as it is shown**: one row for every cell in the grid and
   * every button on the emergency bar, the bar first — nothing the person can
   * see is missing from the file, and nothing they cannot see is in it.
   */
  it('saves every phrase on the board as a CSV, the emergency bar first', () => {
    // Counted off the board itself, so the grid has to be holding all of it
    // rather than the windowful it renders when it knows how big it is.
    unmeasuredGrid()
    renderApp()
    const onBoard = cellTexts().length + $$('.emergency-btn').length
    openBackup()
    const { filename, text, table } = savedCsv()

    expect(filename).toMatch(/^peri-phrases-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(text.startsWith('\uFEFF')).toBe(true)
    expect(table[0]).toEqual(['Categories', 'Phrase', 'ID'])
    expect(table[1]).toEqual(['Emergency', 'Help me!', '#em-0'])
    expect(table.slice(1).filter(r => r[2])).toHaveLength(onBoard)
    expect(table).toContainEqual(['Kitchen', 'Put the kettle on', '#custom-mine'])
  })

  /**
   * **The word lists go with the phrases**, after them, one word to a row under
   * the list's name in curly brackets — so a phrase's `{contacts}` and the
   * contacts it offers leave together. A list with nothing on it is still a
   * row, or the sheet would not know it was there.
   */
  it('saves the word lists after the phrases, an empty one included', () => {
    localStorage.setItem('peri_aliases', JSON.stringify({ lists: { contacts: ['Mum'] }, hidden: [] }))
    renderApp()
    openBackup()
    const rows = savedCsv().table.slice(1)
    const first = rows.findIndex(r => r[0]!.startsWith('{'))

    expect(
      rows.slice(0, first).every(r => r[2]!.startsWith('#')),
      'a phrase among the lists',
    ).toBe(true)
    expect(
      rows.slice(first).every(r => /^\{.+\}$/.test(r[0]!) && r[2] === ''),
      'a list among the phrases',
    ).toBe(true)
    expect(rows).toContainEqual(['{contacts}', 'Mum', ''])
    expect(rows).toContainEqual(['{name.given}', '', ''])
    expect(rows.filter(r => r[0] === '{pronouns}').length).toBeGreaterThan(1)
  })

  // The Excel file holds the same board as the CSV, every cell of it text.
  it('saves an Excel workbook holding exactly what the CSV holds', async () => {
    renderApp()
    openBackup()
    const csv = savedCsv().table

    click(btn('Save for Excel'))
    const file = downloads[downloads.length - 1]!
    expect(file.filename).toMatch(/^peri-phrases-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const workbook = await readXlsx(new Uint8Array(await file.blob!.arrayBuffer()))
    expect(workbook.map(r => [r[0] ?? '', r[1] ?? '', r[2] ?? ''])).toEqual(csv)
  })

  /**
   * **Google Sheets takes a paste**: tab-separated, so every phrase lands in a
   * cell of its own when it is pasted into an empty sheet, with nothing to
   * upload anywhere.
   */
  it('copies the board to paste straight into Google Sheets', async () => {
    renderApp()
    openBackup()
    click(btn('Copy for Sheets'))
    await flush()

    const copied = vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)![0]
    expect(copied.split('\n')[0]).toBe('Categories\tPhrase\tID')
    expect(copied).toContain('Kitchen\tPut the kettle on\t#custom-mine')
    expect($('.sheet-status')?.textContent).toMatch(/paste it into the first cell/i)
  })
})

describe('bringing a spreadsheet back', () => {
  /**
   * **The round trip the feature is for**: the board out to a sheet, changed
   * there — a phrase reworded, one moved, one written — and back, landing on
   * the board somebody is looking at.
   */
  it('brings back a sheet changed in a spreadsheet, and the board shows it', async () => {
    renderApp()
    openBackup()
    const table = savedCsv().table
    const edited = table.map(r =>
      r[2] === '#custom-mine'
        ? ['Kitchen', 'Put the big kettle on', r[2]]
        : r[2] === '#custom-also'
          ? ['Rooms', r[1]!, r[2]]
          : r,
    )
    edited.push(['Kitchen', 'Where is the teapot?', ''])
    const csv = edited
      .map(r => r.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\r\n')

    await choose('edited.csv', csv)
    expect(summary()).toMatch(/1 new, 2 changed/)
    click(btn('Add and update'))
    await flush()

    expect(toast()).toMatch(/Spreadsheet brought in — 1 new, 2 changed/)
    click($$('.filter-tab').find(t => t.textContent === 'Kitchen'))
    expect(cellTexts()).toEqual(expect.arrayContaining(['Put the big kettle on', 'Where is the teapot?']))
    expect(cellTexts()).not.toContain('Put the kettle on')
    click($$('.filter-tab').find(t => t.textContent === 'Rooms'))
    expect(cellTexts()).toContain('Open the window')
  })

  /**
   * **An Excel file back in**, by what is in it rather than what it is called:
   * the workbook Peri wrote, read straight back, changes nothing at all — so
   * adding has nothing to add and goes quiet rather than pretending otherwise.
   */
  it('reads an Excel workbook back, and has nothing to add from its own', async () => {
    renderApp()
    openBackup()
    click(btn('Save for Excel'))
    const bytes = new Uint8Array(await downloads.at(-1)!.blob!.arrayBuffer())

    await choose('no-extension', bytes, '')
    expect(summary()).toMatch(/nothing to change, and [\d,]+ already on the board/)
    expect(btn('Add and update')!.classList.contains('is-disabled')).toBe(true)
    expect(btn('Replace all phrases'), 'offered to replace with nothing to remove').toBeUndefined()
  })

  /**
   * **A paste from Sheets is tab-separated, never guessed at**: a single column
   * of phrases keeps its commas, and a sheet with no categories files them
   * under Imported.
   */
  it('takes a column of phrases pasted from Sheets, commas and all', async () => {
    renderApp()
    openBackup()
    setClipboardText('Phrase\nTea with honey\nCoffee, black, no sugar')
    click(btn('Paste from Sheets'))
    await flush()

    expect(summary()).toMatch(/2 phrases from what you copied: 2 new/)
    expect(note()).toMatch(/no ID column, so it can only add/)
    expect(btn('Replace all phrases')).toBeUndefined()
    click(btn('Add and update'))
    await flush()

    // Named in no category, they are in Library alone.
    const stored = JSON.parse(localStorage.getItem(STORE_KEY)!)
    expect(stored.custom.slice(-2).map((c: { text: string; category: string }) => [c.text, c.category])).toEqual([
      ['Tea with honey', 'Library'],
      ['Coffee, black, no sugar', 'Library'],
    ])
    expect($$('.filter-tab').map(t => t.textContent)).not.toContain('Imported')
  })

  /**
   * **Replacing makes the board match the sheet**, and says first how many
   * phrases that takes away — the rows somebody deleted from it are phrases
   * deleted from the board.
   */
  it('replaces the board with the sheet, taking away the rows it lost', async () => {
    renderApp()
    openBackup()
    const table = savedCsv().table.filter(r => r[2] !== '#custom-mine' && r[2] !== '#em-2')
    const csv = table
      .map(r => r.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n')

    await choose('trimmed.csv', csv)
    expect(note()).toMatch(/removes the 2 phrases on it that the sheet does not have/)
    click(btn('Replace phrases and lists'))
    await flush()

    expect(toast()).toMatch(/2 removed/)
    expect($$('.emergency-btn').map(b => b.textContent)).not.toContain('Call 911')
    click($$('.filter-tab').find(t => t.textContent === 'Kitchen'))
    expect(cellTexts()).toEqual(['Open the window'])
  })

  // Replacing took both of Kitchen's phrases, and a tab for a category with
  // nothing in it is one more thing to read past.
  it('leaves no category behind that the sheet emptied', async () => {
    renderApp()
    localStorage.setItem(STORE_KEY, JSON.stringify({ custom: [MINE, ALSO], categories: ['Kitchen'] }))
    cleanupAndRender()
    openBackup()
    const csv = csvOf(savedCsv().table.filter(r => r[0] !== 'Kitchen'))

    await choose('no-kitchen.csv', csv)
    click(btn('Replace phrases and lists'))
    await flush()

    expect($$('.filter-tab').map(t => t.textContent)).not.toContain('Kitchen')
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!).members).not.toHaveProperty('Kitchen')
  })

  /**
   * **A word added to a list in the sheet is on the list**, and a phrase that
   * names the list offers it — the contacts somebody types into a spreadsheet
   * for them are the contacts their board calls.
   */
  it('brings word lists back in with the phrases, and the board uses them', async () => {
    // The phrase that calls the list is one of thousands, so it is only on
    // screen to be found with the whole board rendered.
    unmeasuredGrid()
    renderApp()
    openBackup()
    const table = savedCsv().table.map(r => (r[0] === '{contacts}' ? ['{contacts}', 'Dr Patel', ''] : r))
    await choose('lists.csv', csvOf(table))
    expect(summary()).toMatch(/phrases and \d+ word lists from lists\.csv: 1 list changed/)
    click(btn('Add and update'))
    await flush()

    expect(JSON.parse(localStorage.getItem('peri_aliases')!).lists.contacts).toEqual(['Dr Patel'])
    expect(cellTexts()).toContain("I'm going to call Dr Patel")
  })

  /**
   * **Replacing takes a list away too**, where the sheet no longer has it, and
   * says so first. A list Peri ships is hidden rather than deleted, as the
   * Aliases panel does it.
   */
  it('replaces the lists with the sheet, taking away the one it lost', async () => {
    renderApp()
    openBackup()
    const table = savedCsv().table.filter(r => r[0] !== '{pronouns}')
    await choose('no-pronouns.csv', csvOf(table))
    expect(note()).toMatch(/removes the 1 list on it that the sheet does not have/)
    click(btn('Replace phrases and lists'))
    await flush()

    expect(toast()).toMatch(/1 list removed/)
    expect(JSON.parse(localStorage.getItem('peri_aliases')!).hidden).toEqual(['pronouns'])
  })

  // A sheet with no lists in it says nothing about them: replacing leaves them
  // alone, and the button says it replaces phrases and no more.
  it('leaves the lists alone when the sheet has none', async () => {
    const mine = { lists: { contacts: ['Mum'], 'my-list': ['x'] }, hidden: ['pronouns'] }
    localStorage.setItem('peri_aliases', JSON.stringify(mine))
    renderApp()
    openBackup()
    const table = savedCsv().table.filter(r => !r[0]!.startsWith('{') && r[2] !== '#custom-mine')
    await choose('phrases-only.csv', csvOf(table))
    expect(btn('Replace phrases and lists')).toBeUndefined()
    click(btn('Replace all phrases'))
    await flush()

    expect(toast()).toMatch(/— 1 removed$/)
    expect(JSON.parse(localStorage.getItem('peri_aliases')!)).toEqual(mine)
  })

  it('goes back to the two ways in on Cancel, having changed nothing', async () => {
    renderApp()
    openBackup()
    setClipboardText('Phrase\nTea with honey')
    click(btn('Paste from Sheets'))
    await flush()
    click(btn('Cancel'))

    expect($('.sheet-incoming')).toBeNull()
    expect(btn('Choose a spreadsheet')).toBeDefined()
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!).custom).toHaveLength(2)
  })
})

/**
 * **Nothing throws a stack trace at the user.** Each way this can fail says so
 * in a sentence under the controls, and says what to do instead.
 */
describe('a spreadsheet that cannot come in', () => {
  // Found by what is in it, not by its name: a workbook with a password on it
  // is the same kind of file as a pre-2007 one, whatever it is called.
  it('names an older Excel file, or a locked one, for what it is', async () => {
    renderApp()
    openBackup()
    await choose('locked', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), '')
    expect($('.sheet-error')?.textContent).toMatch(/older Excel file/)
    expect($('.sheet-incoming')).toBeNull()
  })

  it('refuses a file that is not a spreadsheet at all', async () => {
    renderApp()
    openBackup()
    await choose('photo.csv', new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10, 0x4a, 0x46]), '')
    expect($('.sheet-error')?.textContent).toMatch(/not a spreadsheet Peri can read/)
    expect($('.sheet-incoming')).toBeNull()
  })

  it('says a sheet with nothing in it is empty', async () => {
    renderApp()
    openBackup()
    await choose('blank.csv', '\n,,\n')
    expect($('.sheet-error')?.textContent).toMatch(/empty/)
  })

  it('says when the clipboard cannot be read, and what to use instead', async () => {
    renderApp()
    openBackup()
    vi.mocked(navigator.clipboard.readText).mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
    click(btn('Paste from Sheets'))
    await flush()
    expect($('.sheet-error')?.textContent).toMatch(/Choose a spreadsheet file instead/)
  })

  /**
   * A rest carries no press, and the browser opens its picker only for one —
   * so for somebody working by gaze alone this is refused every time, and it
   * says so, naming the paste that works by resting.
   */
  it('says what to do instead when a rest cannot open the picker', () => {
    renderApp()
    openBackup()
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      value: () => {
        throw new DOMException('needs a user gesture', 'NotAllowedError')
      },
    })
    rest(btn('Choose a spreadsheet'))
    expect($('.sheet-error')?.textContent).toMatch(/Paste from Sheets works by resting/)
    Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker')
  })
})

afterEach(() => cleanup())

// Menu → Backup & sharing → Phrases as a spreadsheet. The screen over
// `core/sheet.ts` and `core/xlsx.ts`.
//
// Three ways out and two ways back, because three programs are asked for and
// they do not want the same thing:
//
//  * **Excel wants a workbook.** A CSV opened in Excel is read by guessing, and
//    it guesses that `1/2` is the second of January; a workbook's cells say
//    they are text. So the Excel file is the one to edit in, in Excel.
//  * **Everything else takes CSV**, including Numbers, LibreOffice and a
//    database somebody's clinic keeps its word lists in.
//  * **Google Sheets takes a paste.** Copying the board as tab-separated text
//    and pasting it into an empty sheet puts every phrase in its own cell, with
//    nothing to upload; copying the cells back out and pasting them here is
//    the way home. Sheets also opens the Excel file, and downloads one — the
//    guide says both.
//
// Nothing here leaves the device: a file is saved where the browser saves
// files, and the clipboard is the clipboard.

import { useCallback, useState } from 'react'
import { useSettings } from '../ui/settings'
import { FileButton, PanelButton } from '../ui/controls'
import { type AliasStore, type Phrase } from '../core/phrases'
import { type PhraseStore } from '../core/store'
import { type AppState } from '../core/backup'
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
  type SheetMode,
  type SheetPlan,
  type SheetRow,
} from '../core/sheet'
import { isCompoundFile, isZip, readXlsx, SheetFileError, writeXlsx, XLSX_TYPE } from '../core/xlsx'
import { saveFile } from './backup-file'

/** What the picker offers: the three kinds of file it can read. */
const ACCEPT = [
  '.xlsx',
  '.csv',
  '.tsv',
  '.txt',
  XLSX_TYPE,
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
].join(',')

interface Incoming {
  rows: SheetRow[]
  /** Where it came from, for the line that says what it holds. */
  from: string
  merge: SheetPlan
  /** Null where the sheet carries no IDs, and so can only add. */
  replace: SheetPlan | null
}

export function SheetSection({
  store,
  aliases,
  phrases,
  categories,
  onRestore,
}: {
  store: PhraseStore
  aliases: AliasStore
  /** Every phrase on the board, the emergency bar's included. */
  phrases: Phrase[]
  /** The tabs, in the order they are shown. */
  categories: string[]
  onRestore: (next: AppState, message: string) => void
}) {
  const { settings } = useSettings()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<Incoming | null>(null)

  const say = useCallback((message: string) => {
    setError(null)
    setStatus(message)
  }, [])
  const complain = useCallback((message: string) => {
    setStatus(null)
    setError(message)
  }, [])

  /** The board as the table every one of the three ways out writes. */
  const table = useCallback(
    () => rowsToTable(boardRows(phrases, categories, store.phraseOrder)),
    [phrases, categories, store.phraseOrder],
  )

  const saveExcel = useCallback(() => {
    const name = sheetFilename('xlsx')
    // Wide enough to read a phrase without widening a column first; the
    // phrases wrap, and the ID is narrow because nobody needs to read it.
    const bytes = writeXlsx(table(), { sheetName: 'Phrases', widths: [22, 70, 14], wrap: [1] })
    if (saveFile(name, bytes, XLSX_TYPE)) say(`Saved as ${name}`)
    else complain('Peri could not save the file. Copy for Sheets instead.')
  }, [table, say, complain])

  const saveCsv = useCallback(() => {
    const name = sheetFilename('csv')
    if (saveFile(name, toCsv(table()), 'text/csv;charset=utf-8')) say(`Saved as ${name}`)
    else complain('Peri could not save the file. Copy for Sheets instead.')
  }, [table, say, complain])

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(toTsv(table()))
      .then(() => say('Copied — paste it into the first cell of an empty sheet'))
      .catch(() => complain('Peri could not reach the clipboard. Save a file instead.'))
  }, [table, say, complain])

  const load = useCallback(
    (cells: string[][], from: string) => {
      const read = readRows(cells)
      if (!read.ok) {
        setIncoming(null)
        complain(read.error)
        return
      }
      const board = { store, phrases, categories }
      setError(null)
      setStatus(null)
      setIncoming({
        rows: read.rows,
        from,
        merge: applySheet(read.rows, board, 'merge').plan,
        replace: read.hasIds ? applySheet(read.rows, board, 'replace').plan : null,
      })
    },
    [store, phrases, categories, complain],
  )

  /**
   * A workbook or text, told apart by what is in the file rather than by what
   * it is called — a workbook renamed to .csv is still a workbook, and a file
   * saved with no extension at all is common on a phone.
   */
  const loadFile = useCallback(
    (file: File) => {
      file
        .arrayBuffer()
        .then(async buffer => {
          const bytes = new Uint8Array(buffer)
          // A workbook — or an older Excel file, which `readXlsx` names for
          // what it is rather than reading as text.
          if (isZip(bytes) || isCompoundFile(bytes) || /\.xlsx?$/i.test(file.name)) {
            load(await readXlsx(bytes), file.name)
            return
          }
          const text = textOf(bytes)
          if (text === null) {
            complain(
              'That file is not a spreadsheet Peri can read. Save it as an Excel workbook (.xlsx) or as CSV and try again.',
            )
            return
          }
          load(parseDelimited(text, /\.(tsv|tab)$/i.test(file.name) ? '\t' : undefined), file.name)
        })
        .catch((e: unknown) =>
          complain(e instanceof SheetFileError ? e.message : 'Peri could not read that file.'),
        )
    },
    [load, complain],
  )

  // Everything a spreadsheet puts on the clipboard is tab-separated, so the
  // text is read that way rather than guessed at — a single column of phrases
  // guessed at would be split at its commas.
  const paste = useCallback(() => {
    navigator.clipboard
      ?.readText?.()
      .then(text => load(parseDelimited(text, '\t'), 'what you copied'))
      .catch(() => complain('Peri could not reach the clipboard. Choose a spreadsheet file instead.'))
  }, [load, complain])

  const refused = useCallback(
    () => complain('Your browser only opens a file on a real click or tap. Paste from Sheets works by resting.'),
    [complain],
  )

  /**
   * Worked out again from the board as it is now rather than taken from when
   * the sheet was read: the plan on screen is what was counted, and what is
   * applied has to be against the board it lands on.
   */
  const bringIn = useCallback(
    (mode: SheetMode) => {
      if (!incoming) return
      const { store: next, plan } = applySheet(incoming.rows, { store, phrases, categories }, mode)
      setIncoming(null)
      onRestore({ store: next, aliases, settings }, `Spreadsheet brought in — ${describePlan(plan, mode)}`)
    },
    [incoming, store, phrases, categories, aliases, settings, onRestore],
  )

  const unchanged = incoming?.merge.unchanged ?? 0

  return (
    <>
      <span className="setting-label backup-heading">Phrases as a spreadsheet</span>
      <p className="backup-note">
        Every phrase on the board, one to a row, to read or change in Excel, Google Sheets or anything else that
        opens a spreadsheet — then bring the sheet back. Leave the ID column as it is: it is how Peri knows which
        phrase each row is.
      </p>
      <div className="backup-actions">
        <PanelButton kind="primary" label="Save for Excel" onActivate={saveExcel} />
        <PanelButton kind="plain" label="Save as CSV" onActivate={saveCsv} />
        <PanelButton kind="plain" label="Copy for Sheets" onActivate={copy} />
      </div>

      <span className="setting-label backup-heading">Bring a spreadsheet in</span>
      {incoming ? (
        <div className="backup-incoming sheet-incoming" role="group" aria-label="Bring this spreadsheet in">
          <p className="backup-summary">
            {incoming.rows.length.toLocaleString()} {incoming.rows.length === 1 ? 'phrase' : 'phrases'} from{' '}
            {incoming.from}: {describePlan(incoming.merge, 'merge')}
            {unchanged > 0 && `, and ${unchanged.toLocaleString()} already on the board as they are`}.
          </p>
          <div className="backup-actions">
            <PanelButton
              kind="primary"
              label="Add and update"
              onActivate={() => bringIn('merge')}
              disabled={!planChanges(incoming.merge, 'merge')}
            />
            {incoming.replace && incoming.replace.removed > 0 && (
              <PanelButton kind="danger" label="Replace all phrases" onActivate={() => bringIn('replace')} />
            )}
            <PanelButton kind="plain" label="Cancel" onActivate={() => setIncoming(null)} />
          </div>
          <p className="backup-note">
            Adding and updating never takes a phrase away.{' '}
            {incoming.replace
              ? incoming.replace.removed > 0
                ? `Replacing makes the board match the sheet, which also removes the ${incoming.replace.removed.toLocaleString()} ${incoming.replace.removed === 1 ? 'phrase' : 'phrases'} on it that the sheet does not have.`
                : 'Everything on the board is in the sheet, so there is nothing for replacing to remove.'
              : 'This sheet has no ID column, so it can only add.'}
          </p>
        </div>
      ) : (
        <div className="backup-actions">
          <FileButton label="Choose a spreadsheet" accept={ACCEPT} onFile={loadFile} onRefused={refused} />
          <PanelButton kind="plain" label="Paste from Sheets" onActivate={paste} />
        </div>
      )}

      {error && (
        <p className="backup-error sheet-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="backup-status sheet-status" role="status">
          {status}
        </p>
      )}
    </>
  )
}

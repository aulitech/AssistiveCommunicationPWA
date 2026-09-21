// Turning a backup, or the board as a spreadsheet, into a file the browser saves.
//
// Separate from `core/backup.ts`, which is data in and data out and touches
// nothing — and separate from the panel, because two places offer to save one
// now: **Backup & sharing**, and the confirmation in front of a factory reset,
// which offers a way out before it takes everything away.

import { backupFilename, serializeBackup, type Backup } from '../core/backup'

/**
 * A file handed to the browser to save, and whether it took it. Reported rather
 * than thrown: every caller has somewhere to put the answer and something else
 * to offer instead — copying, for the backup and the spreadsheet alike.
 */
export function saveFile(name: string, data: BlobPart, type: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([data], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Save it, and say whether the browser took it. The reset confirmation must not
 * go on to wipe the device having only appeared to save a copy of it.
 */
export function downloadBackup(backup: Backup): { ok: true; name: string } | { ok: false } {
  const name = backupFilename(backup)
  return saveFile(name, serializeBackup(backup), 'application/json') ? { ok: true, name } : { ok: false }
}

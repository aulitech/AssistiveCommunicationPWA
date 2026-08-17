// Turning a backup into a file the browser saves.
//
// Separate from `core/backup.ts`, which is data in and data out and touches
// nothing — and separate from the panel, because two places offer to save one
// now: **Backup & sharing**, and the confirmation in front of a factory reset,
// which offers a way out before it takes everything away.

import { backupFilename, serializeBackup, type Backup } from '../core/backup'

/**
 * Save it, and say whether the browser took it. Reported rather than thrown: the
 * caller has somewhere to put the answer and a fallback to offer — the backup
 * panel can suggest copying instead, and the reset confirmation must not go on
 * to wipe the device having only appeared to save a copy of it.
 */
export function downloadBackup(backup: Backup): { ok: true; name: string } | { ok: false } {
  const name = backupFilename(backup)
  try {
    const url = URL.createObjectURL(new Blob([serializeBackup(backup)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    return { ok: true, name }
  } catch {
    return { ok: false }
  }
}

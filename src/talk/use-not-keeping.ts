// Whether this device has stopped keeping what is changed, and the backup that
// answers it — the strip at the top of the talk screen. See
// docs/decisions/saying-when-something-failed.md.

import { useCallback, useEffect, useState } from 'react'
import { buildBackup } from '../core/backup'
import { onWriteFailure, type Settings } from '../core/store'
import { holdDwells } from '../ui/dwell'
import { downloadBackup } from '../menu/backup-file'
import { type Board } from './use-board'

export function useNotKeeping(board: Board, settings: Settings) {
  const { store } = board

  /**
   * **Whether this device has stopped keeping what is changed.** A write the
   * browser refused — a full store, a private window — no longer takes the
   * screen down with it (`writeKey`), so the board carries on from memory, and
   * that is exactly what makes it dangerous: everything looks fine until the
   * next reload hands back the board as it was before. So it says so, and it
   * stays said — a toast would be gone before a gaze reached it — with a backup
   * one dwell away while memory still holds what storage does not.
   */
  const [notKeeping, setNotKeeping] = useState(false)
  useEffect(() => onWriteFailure(() => setNotKeeping(true)), [])
  // The strip arrives at the top and moves everything below it, under a
  // pointer that has not moved.
  useEffect(() => {
    if (notKeeping) holdDwells()
  }, [notKeeping])
  const [keptInFile, setKeptInFile] = useState<boolean | null>(null)

  /**
   * The board as it is **in memory**, which is the point: storage is what has
   * stopped taking changes, so a backup built from it would leave out exactly
   * the ones at risk. The same file the Backup panel writes.
   */
  const keepInFile = useCallback(() => {
    const backup = buildBackup({ store, aliases: board.aliases, settings, categoryById: board.categoryById })
    setKeptInFile(downloadBackup(backup).ok)
  }, [store, board.aliases, board.categoryById, settings])

  return { notKeeping, keptInFile, keepInFile }
}

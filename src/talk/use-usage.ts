// How much each phrase is used: how many times, and when last.
//
// **The board is arranged by it once what was chosen has been said** — and at
// the next tab, or an order chosen — rather than on the dwell that counted it:
// see `use-grid-order.ts`. The pointer is somebody's gaze and it rests where it
// last fired, so the cell arriving under it after the rearrangement would start
// dwelling on nobody's instruction. That is `holdDwellsUntilMoved`, called
// where the board is rearranged — nothing can be chosen until the gaze has
// moved.

import { useCallback, useState } from 'react'
import { forgetUse, loadUsage, recordUse, saveUsage, type PhraseUse, type PhraseUsage } from '../core/store'

export function useUsage() {
  const [counts, setCounts] = useState<PhraseUsage>(loadUsage)

  const write = useCallback((next: PhraseUsage) => {
    saveUsage(next)
    setCounts(next)
  }, [])

  // Both of these read storage back rather than closing over `counts`, for the
  // reason the sent list does: two phrases can be spoken without a render in
  // between, and the second would otherwise be counted against a record that no
  // longer exists.
  const record = useCallback((id: string) => write(recordUse(loadUsage(), id)), [write])

  /**
   * Drops a deleted phrase's count, so the record stays the size of the board —
   * and hands back what it dropped, so an undone delete puts the phrase back
   * where Most used had it rather than among the phrases nobody has used.
   */
  const forget = useCallback(
    (id: string): PhraseUse | undefined => {
      const usage = loadUsage()
      write(forgetUse(usage, id))
      return usage[id]
    },
    [write],
  )

  /** Puts back a count that an undone delete took. */
  const restore = useCallback((id: string, use: PhraseUse) => write({ ...loadUsage(), [id]: use }), [write])

  return { counts, record, forget, restore }
}

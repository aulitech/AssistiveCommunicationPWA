// How much each phrase is used: how many times, and when last.
//
// **The board is arranged by it live.** Using a phrase counts it and the grid
// rearranges on the same dwell, which is what "most recently used" says on the
// tin — and what makes the order worth having, since the phrase somebody is
// about to want next is usually the one they just used.
//
// What that costs is the thing this app has to be careful about: the pointer is
// somebody's gaze and it rests where it last fired, so the cell arriving under
// it after the rearrangement would start dwelling on nobody's instruction. That
// is `holdDwellsUntilMoved`, called where the board is rearranged — nothing can
// be chosen until the gaze leaves whatever it is resting on.

import { useCallback, useState } from 'react'
import { forgetUse, loadUsage, recordUse, saveUsage, type PhraseUsage } from '../core/store'

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

  /** Drops a deleted phrase's count, so the record stays the size of the board. */
  const forget = useCallback((id: string) => write(forgetUse(loadUsage(), id)), [write])

  return { counts, record, forget }
}

// How much each phrase is used, and the snapshot of it the board is arranged by.
//
// Those are deliberately two different things. **A usage sort settles rather
// than following every dwell**: using a phrase counts it immediately, but the
// board only rearranges when the tab or the arrangement changes.
//
// Live re-sorting is the obvious reading of "most recently used" and it is the
// wrong behaviour here. The pointer is somebody's gaze, and it rests where it
// last fired — so a board that reordered itself the instant a phrase was spoken
// would slide a different phrase under a resting gaze and say that one too. It
// would also collapse the grid's window and take the view back to the top after
// every utterance, mid-conversation. What somebody asked for by choosing this
// order is a board arranged by what they use, not a board that moves while they
// are using it.

import { useCallback, useState } from 'react'
import { forgetUse, loadUsage, recordUse, saveUsage, type PhraseUsage } from '../core/store'

export function useUsage(arrangeKey: string) {
  const [counts, setCounts] = useState<PhraseUsage>(loadUsage)

  // The snapshot the board is arranged by, captured whenever `arrangeKey`
  // changes — the tab, or the chosen arrangement. Adjusted during render rather
  // than in an effect, the same way the grid restarts its window, so no pass is
  // ever painted with the old snapshot over a new tab.
  const [arranged, setArranged] = useState(() => ({ key: arrangeKey, counts }))
  if (arranged.key !== arrangeKey) setArranged({ key: arrangeKey, counts })

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

  return { arrangedBy: arranged.counts, record, forget }
}

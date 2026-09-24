import { useCallback, useEffect, useState } from 'react'
import { onDwellActivation } from '../ui/dwell'

/**
 * How long a toast waits for the next dwell before going by itself.
 *
 * A ceiling, not a duration: the next dwell takes it well before this in any
 * conversation. What this covers is the board nobody is working — a message
 * left standing on a screen somebody has walked away from reads, when they come
 * back, as news about whatever they do next.
 */
const TOAST_CEILING_MS = 10_000

/**
 * The one-line message that appears and goes. Used for things a control's own
 * appearance cannot say — which way a mode just went, that a copy worked, what
 * a held category is waiting for.
 *
 * **It stays until the next dwell**, the rule the mark on the last phrase said
 * follows and for the same reason. It went after two seconds, and for much of
 * what it says — a save, a paste the browser refused, a link it would not open —
 * it is the only thing that says anything at all; a gaze on the board rather
 * than on the corner could miss the whole of it. What it claims is about the
 * last thing somebody did, and that stops being true the moment they do the
 * next one — which is when it goes.
 *
 * The dwell that *causes* a toast does not take it away: every control tells
 * its listeners before its own action runs, so the toast it raises arrives
 * after the clearing has already happened.
 */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => onDwellActivation(() => setToast(null)), [])

  const flashToast = useCallback((message: string) => {
    setToast(message)
    // Matched on the way out, so a second message arriving while the first is
    // up is not taken away by the first one's timer.
    setTimeout(() => setToast(t => (t === message ? null : t)), TOAST_CEILING_MS)
  }, [])

  return { toast, flashToast }
}

// Waiting for a moment before saying so.
//
// Its own module rather than a hook exported from `controls.tsx`, for the reason
// `style.ts` is its own: a file that mixes components with plain functions loses
// fast refresh for everything importing it, and `controls.tsx` is imported by
// nearly every screen here. Two things reach for this — the `BusyIndicator` in
// the corner and the line that waits in the message box for a reply — so it can
// no longer live inside either.

import { useEffect, useState } from 'react'

/**
 * How long the app has to be busy before it says so.
 *
 * A spinner that appears for the fifty milliseconds a warm sync takes is a
 * flicker, and a flicker costs more here than anywhere else: the pointer *is*
 * the user's gaze, so anything that catches the eye moves it — an indicator
 * that blinks does not just distract, it aims.
 */
const BUSY_DELAY_MS = 250

/**
 * True once `on` has stayed true for a moment. Going off is immediate: the
 * delay is there to swallow flickers, not to leave one on screen after the
 * work is done.
 *
 * Adjusted during render rather than in an effect, the way the grid tracks the
 * list it windowed — a pass showing "still working" after it has stopped is the
 * exact thing being avoided.
 */
export function useSettled(on: boolean): boolean {
  const [shown, setShown] = useState(false)
  const [wasOn, setWasOn] = useState(on)
  if (wasOn !== on) {
    setWasOn(on)
    if (!on) setShown(false)
  }
  useEffect(() => {
    if (!on) return
    const timer = setTimeout(() => setShown(true), BUSY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [on])
  return shown
}

// A choice made on a full-screen grid, held until Done or Cancel says what to
// do with it.
//
// **A grid with Done and Cancel on it waits for one of them.** Three of this
// app's grids did not — the spoken language, the model behind a suggested reply
// and the order of the phrases — and closed on the first tile a rest landed on,
// with a Cancel that did exactly what Done did. On a board aimed at by gaze that
// is the wrong way round: a rest is how somebody *looks* at a tile as well as
// how they choose one, and a grid that commits to whatever the eye passes over
// first is a grid that chooses for them. It also left two buttons on screen that
// meant nothing.
//
// So a tile only *marks* its choice. Done commits it, Cancel throws it away, and
// nothing about the board changes until one of them is chosen — which is also
// why this holds the choice here rather than applying it and putting it back:
// choosing a language writes down the voice it is leaving, and a language only
// passed over on the way to another must not leave a voice behind it.
//
// The voice picker applies as it goes and puts back on Cancel instead, and that
// is deliberate rather than a second way of doing this: every voice speaks as it
// is chosen, and hearing it is the point. None of these three has anything to
// try out.
//
// Its own module rather than a hook exported from `controls.tsx`, for the reason
// `style.ts` and `settle.ts` are: a file mixing components with plain functions
// loses fast refresh for everything importing it.

import { useCallback, useState } from 'react'

export function usePendingChoice<T>(
  /** What is chosen now, which a grid opens on. */
  value: T,
  /** Called on Done, and only when something different was chosen. */
  commit: (chosen: T) => void,
  /** Called however the grid closes — for what has to happen either way. */
  onClose?: () => void,
) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(value)

  /**
   * Opens on what is chosen *now*, not on whatever was marked last time: a grid
   * cancelled out of and opened again must not arrive showing the choice it was
   * told to forget.
   */
  const begin = useCallback(() => {
    setPending(value)
    setOpen(true)
  }, [value])

  const close = useCallback(() => {
    setOpen(false)
    onClose?.()
  }, [onClose])

  const done = useCallback(() => {
    // **Done with nothing moved writes nothing.** Not an economy: choosing the
    // language the board is already in still writes the voice in use into the
    // voice memory, which is a change to the settings — so it would travel to
    // the user's other devices and arrive there as "Board updated from your other
    // device", a notice about something nobody did.
    if (pending !== value) commit(pending)
    close()
  }, [pending, value, commit, close])

  return { open, pending, mark: setPending, begin, done, cancel: close }
}

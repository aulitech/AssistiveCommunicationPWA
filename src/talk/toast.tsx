// Where the line that says what just happened stands — see `use-toast.ts` for
// when it comes and goes.

import { useLayoutEffect, useRef } from 'react'

/**
 * **In the upper third of the phrase table**, centred across it: where a gaze
 * working the board already is, rather than a corner it has to go and look in.
 * For a save, a refused paste or a blocked link the toast is the only thing that
 * says anything.
 *
 * Measured from the table each time a toast arrives, and again if the window
 * changes while it is up, because the table is not the same shape twice — the
 * message box grows, listen mode opens above it, Getting started takes half the
 * screen. Written straight onto the region rather than held in state: it is
 * where something is drawn, not anything the screen decides by. Where there is
 * no table to measure — Getting started standing in its place, or jsdom — the
 * stylesheet's own place above the emergency bar is left standing.
 */
export function ToastRegion({ toast }: { toast: string | null }) {
  const region = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = region.current
    if (!el || !toast) return
    const place = () => {
      const table = document.querySelector('.grid-wrapper')?.getBoundingClientRect()
      const measured = !!table && table.height > 0
      el.classList.toggle('is-over-table', measured)
      el.style.top = measured ? `${table.top + table.height / 6}px` : ''
      el.style.left = measured ? `${table.left + table.width / 2}px` : ''
      el.style.maxWidth = measured ? `calc(${table.width}px - 2rem)` : ''
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [toast])

  return (
    <div ref={region} className="toast-region" role="status" aria-live="polite">
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

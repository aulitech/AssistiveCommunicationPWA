import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { DwellLink } from '../../src/ui/controls'
import { holdDwells, SETTLE_MS } from '../../src/ui/dwell'
import { DEFAULT_SETTINGS } from '../../src/core/store'

// A link aimed at by dwell. Driven to a `#` address, because that is the one
// navigation jsdom carries out — so where the link went can be read back off the
// address itself rather than off a spy standing in for it.

beforeEach(() => {
  vi.useFakeTimers()
  window.location.hash = ''
})
afterEach(() => {
  vi.useRealTimers()
  window.location.hash = ''
})

const link = () => {
  const { container } = render(<DwellLink href="#followed">Terms of Service</DwellLink>)
  return container.querySelector('a')!
}

describe('a link aimed at by dwell', () => {
  it('is followed by resting on it, with no press anywhere', () => {
    const a = link()
    fireEvent.pointerEnter(a)
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.actionDwellMs + 50))
    expect(window.location.hash).toBe('#followed')
  })

  // A real anchor underneath, so a mouse still follows it with a click.
  it('is followed by a click too', () => {
    fireEvent.click(link())
    expect(window.location.hash).toBe('#followed')
  })

  /**
   * **A click in the second after the screen moved is refused, as it is on every
   * other control.** On a gaze rig set to send real clicks, the click *is* the
   * dwell — the operating system is doing the holding — so an anchor that
   * followed its own click would walk straight round the guard the rest of the
   * app keeps. The link hands its click to the dwell hook rather than going by
   * itself, and this is what holds it there.
   */
  it('refuses a click while the screen is still settling', () => {
    const a = link()
    holdDwells()
    fireEvent.click(a)
    expect(window.location.hash, 'followed a click the rest of the app would refuse').toBe('')

    act(() => void vi.advanceTimersByTime(SETTLE_MS + 50))
    fireEvent.click(a)
    expect(window.location.hash).toBe('#followed')
  })
})

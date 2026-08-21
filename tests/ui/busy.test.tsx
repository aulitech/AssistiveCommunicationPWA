// The one thing on screen that says "wait".
//
// Two things can keep somebody waiting here — an exchange with the sync server,
// and re-parsing the phrase table after an alias list changes — and both of them
// are usually over in a few milliseconds. What is tested here is mostly the
// *delay*: an indicator that blinks on and off is worse than none at all, since
// the pointer is the user's gaze and anything that catches the eye moves it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BusyIndicator } from '../../src/ui/controls'

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const said = () => screen.queryByText('Synchronizing')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the waiting indicator', () => {
  it('says nothing while there is nothing to wait for', () => {
    render(<BusyIndicator busy={false} label="Synchronizing" />)
    advance(5000)
    expect(said()).toBeNull()
  })

  // The whole point of the delay: the work that usually happens is fast enough
  // that showing anything would be a flicker.
  it('waits before it says anything', () => {
    render(<BusyIndicator busy label="Synchronizing" />)
    advance(200)
    expect(said(), 'a flicker made it onto the screen').toBeNull()
  })

  it('says so once the wait has gone on', () => {
    render(<BusyIndicator busy label="Synchronizing" />)
    advance(300)
    expect(said()).not.toBeNull()
  })

  it('leaves as soon as the work is done, without a second delay', () => {
    const { rerender } = render(<BusyIndicator busy label="Synchronizing" />)
    advance(300)
    expect(said()).not.toBeNull()

    rerender(<BusyIndicator busy={false} label="Synchronizing" />)
    expect(said(), 'it lingered after the work finished').toBeNull()
  })

  it('says nothing at all about a wait that ended inside the delay', () => {
    const { rerender } = render(<BusyIndicator busy label="Synchronizing" />)
    advance(200)
    rerender(<BusyIndicator busy={false} label="Synchronizing" />)
    advance(5000)
    expect(said()).toBeNull()
  })

  it('starts the wait again for the next one', () => {
    const { rerender } = render(<BusyIndicator busy label="Synchronizing" />)
    advance(300)
    rerender(<BusyIndicator busy={false} label="Synchronizing" />)

    rerender(<BusyIndicator busy label="Synchronizing" />)
    advance(200)
    expect(said(), 'the second wait skipped its delay').toBeNull()
    advance(100)
    expect(said()).not.toBeNull()
  })

  /**
   * It reports, it does not offer. A gaze on its way past the corner of the
   * screen must not find a target there — and a dwell user has no way to
   * dismiss something that catches one.
   */
  it('is nothing anybody can aim at', () => {
    render(<BusyIndicator busy label="Synchronizing" />)
    advance(300)
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('.busy')?.getAttribute('tabindex')).toBeNull()
  })

  it('is announced rather than only drawn', () => {
    render(<BusyIndicator busy label="Synchronizing" />)
    advance(300)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toContain('Synchronizing')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { SETTLE_MS, holdDwells, releaseDwells, useDwellControl } from '../../src/ui/dwell'

function Probe({
  onActivate,
  durationMs = 500,
  disabled = false,
  repeatMs,
}: {
  onActivate: () => void
  durationMs?: number
  disabled?: boolean
  repeatMs?: number
}) {
  const { active, props } = useDwellControl(durationMs, onActivate, { disabled, repeatMs })
  return (
    <div role="button" aria-label="probe" data-active={active} {...props}>
      probe
    </div>
  )
}

const probe = () => screen.getByRole('button', { name: 'probe' })
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  releaseDwells()
})

describe('dwell', () => {
  it('fires once the pointer has rested for the full duration', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.pointerEnter(probe())
    advance(499)
    expect(onActivate).not.toHaveBeenCalled()

    advance(1)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('marks itself active while dwelling so the fill can animate', () => {
    render(<Probe onActivate={vi.fn()} />)
    expect(probe().dataset.active).toBe('false')

    fireEvent.pointerEnter(probe())
    expect(probe().dataset.active).toBe('true')

    advance(500)
    expect(probe().dataset.active).toBe('false')
  })

  it('cancels when the pointer leaves early', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.pointerEnter(probe())
    advance(300)
    fireEvent.pointerLeave(probe())
    advance(1000)

    expect(onActivate).not.toHaveBeenCalled()
  })

  it('cancels every in-flight dwell when the pointer leaves the window', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.pointerEnter(probe())
    advance(300)
    // relatedTarget null = the pointer left the document entirely.
    fireEvent.pointerOut(window, { relatedTarget: null })
    advance(1000)

    expect(onActivate).not.toHaveBeenCalled()
  })
})

describe('tap', () => {
  it('activates on a click shorter than the dwell time', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.pointerEnter(probe())
    advance(100)
    fireEvent.click(probe())

    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  // Regression guard: dwell and click were separate paths, so a mouse user who
  // hovered past the dwell time and then clicked triggered the action twice.
  it('does not fire again if the dwell already fired during this hover', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate).toHaveBeenCalledTimes(1)

    fireEvent.click(probe())
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('arms again for the next hover', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.pointerEnter(probe())
    advance(500)
    fireEvent.pointerLeave(probe())

    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate).toHaveBeenCalledTimes(2)
  })
})

describe('keyboard and switch access', () => {
  it('is in the tab order', () => {
    render(<Probe onActivate={vi.fn()} />)
    expect(probe().tabIndex).toBe(0)
  })

  it.each(['Enter', ' '])('activates on %s', key => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.keyDown(probe(), { key })
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.keyDown(probe(), { key: 'a' })
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('swallows Space so it cannot scroll the grid away', () => {
    render(<Probe onActivate={vi.fn()} />)
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    fireEvent(probe(), event)
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('disabled', () => {
  it('ignores dwell, click and keys', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} disabled />)

    fireEvent.pointerEnter(probe())
    advance(1000)
    fireEvent.click(probe())
    fireEvent.keyDown(probe(), { key: 'Enter' })

    expect(onActivate).not.toHaveBeenCalled()
  })

  it('drops out of the tab order and says so', () => {
    render(<Probe onActivate={vi.fn()} disabled />)
    expect(probe().tabIndex).toBe(-1)
    expect(probe()).toHaveProperty('ariaDisabled', 'true')
  })
})

describe('repeat mode', () => {
  it('repeats while the pointer rests, then stops on leave', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} repeatMs={100} />)

    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate).toHaveBeenCalledTimes(1)

    advance(300)
    expect(onActivate).toHaveBeenCalledTimes(4)

    fireEvent.pointerLeave(probe())
    advance(1000)
    expect(onActivate).toHaveBeenCalledTimes(4)
  })

  it('stays lit for as long as it is repeating', () => {
    render(<Probe onActivate={vi.fn()} repeatMs={100} />)

    fireEvent.pointerEnter(probe())
    advance(700)
    expect(probe().dataset.active).toBe('true')
  })
})

/**
 * Going deaf for a moment, because the screen moved under the pointer.
 *
 * **A pointer rests where it last fired.** Whatever arrives underneath gets a
 * `pointerenter` of its own — the browser's doing, not a mistake — so a control
 * that appears under a resting pointer starts dwelling on nobody's instruction.
 * Leaving a panel and changing the text size both move everything at once.
 */
describe('the settle after the screen moves', () => {
  it('will not arm while it is deaf', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    holdDwells()
    fireEvent.pointerEnter(probe())
    advance(SETTLE_MS)
    expect(onActivate, 'a control that arrived under the pointer fired').not.toHaveBeenCalled()
  })

  it('arms again once the moment has passed', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    holdDwells()
    advance(SETTLE_MS + 1)

    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  // Pinned at both ends, or a guard of a tenth of a second passes this as well
  // as a guard of one: still deaf just short of the second, and hearing again
  // just after it.
  it('is deaf for the whole second and no longer', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    holdDwells()
    advance(SETTLE_MS - 1)
    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate).not.toHaveBeenCalled()

    fireEvent.pointerLeave(probe())
    advance(2)
    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  /**
   * A control somebody is already resting on is one they are deliberately
   * working. What the guard is for is the opposite case — something that
   * *arrives* under a pointer that has not moved.
   */
  it('leaves a control already being held alone', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    fireEvent.pointerEnter(probe())
    advance(400)
    holdDwells()
    advance(100)
    expect(onActivate, 'the hold in progress was thrown away').toHaveBeenCalledTimes(1)
  })

  /**
   * The one control that changes the text size is a repeating one, and a repeat
   * fires from its own interval rather than by arming. Without that, holding the
   * text-size control would stop itself with every step it took.
   */
  it('leaves a repeat already running alone', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} repeatMs={200} />)

    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate).toHaveBeenCalledTimes(1)

    holdDwells()
    advance(600)
    expect(onActivate.mock.calls.length, 'the repeat stopped itself').toBeGreaterThan(1)
  })
})

/**
 * Going quiet, because the pointer left the window and nothing said so.
 *
 * **Safari sends no event whatsoever** when the pointer moves to another
 * window — measured against the macOS Accessibility Keyboard, which floats over
 * the page and never takes focus. No `pointerout`, no `pointerleave`, no
 * `blur`; `:hover` stays true and the dwell underneath fires into an empty
 * room. The stream itself is the only thing left to read: a tracked pointer
 * emits a move every ~33ms even while its owner holds still, so silence from
 * one of those means it has gone.
 *
 * A mouse is silent at rest and must never be caught by any of this, which is
 * what most of these tests are about.
 */
describe('the pointer going quiet', () => {
  /** A tracked pointer: a move every 33ms, drifting a pixel, going nowhere. */
  const streamInPlace = (target: Element | Window, ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 33) {
      fireEvent.pointerMove(target, { clientX: 400 + (elapsed % 2), clientY: 300 })
      advance(33)
    }
  }

  /** A mouse crossing the screen: just as continuous, but covering ground. */
  const streamAcross = (target: Element | Window, ms: number) => {
    let x = 0
    for (let elapsed = 0; elapsed < ms; elapsed += 33) {
      x += 30
      fireEvent.pointerMove(target, { clientX: x, clientY: 300 })
      advance(33)
    }
  }

  it('holds back a dwell whose pointer stopped sending', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    streamInPlace(window, 1500)
    fireEvent.pointerEnter(probe())
    advance(500)

    expect(onActivate, 'fired at a pointer that had left the window').not.toHaveBeenCalled()
  })

  it('fires normally while the stream is still running', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    streamInPlace(window, 1500)
    fireEvent.pointerEnter(probe())
    streamInPlace(probe(), 600)

    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  /**
   * The one that matters most. A mouse at rest sends nothing at all, so silence
   * is its normal state — and a mouse user whose dwells were held back would be
   * left with no working control to undo it with.
   */
  it('leaves a pointer that never streamed alone', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    // A few moves and then stillness: a mouse arriving and being put down.
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300 })
    advance(20)
    fireEvent.pointerMove(window, { clientX: 401, clientY: 300 })
    fireEvent.pointerEnter(probe())
    advance(500)

    expect(onActivate, 'a resting mouse was mistaken for an absent pointer').toHaveBeenCalledTimes(1)
  })

  /**
   * Continuous movement is not enough on its own — a mouse crossing the screen
   * is continuous too. It is continuous movement *going nowhere* that no mouse
   * produces, because a mouse at rest produces nothing.
   */
  it('leaves a mouse that travelled and then stopped alone', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    streamAcross(window, 1500)
    fireEvent.pointerEnter(probe())
    advance(500)

    expect(onActivate, 'a mouse in transit was taken for a tracker').toHaveBeenCalledTimes(1)
  })

  /**
   * Movement is the only way back. The browser never noticed the pointer leave,
   * so the control is still `:hover` and no `pointerenter` is coming — without
   * this, a control held back once could never fire again.
   */
  it('arms again when the stream comes back', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    streamInPlace(window, 1500)
    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate).not.toHaveBeenCalled()

    streamInPlace(probe(), 600)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('drops the hold when the pointer properly leaves', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    streamInPlace(window, 1500)
    fireEvent.pointerEnter(probe())
    advance(500)
    fireEvent.pointerLeave(probe())

    // Arriving again is an arrival, not a return: it arms from nothing.
    streamInPlace(probe(), 100)
    fireEvent.pointerEnter(probe())
    streamInPlace(probe(), 600)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  /**
   * The worst version of the bug, because it does not stop: a repeating control
   * left running by a pointer that has gone scrolls to the end of the grid, or
   * drives the text size to its limit, with nobody watching.
   */
  it('stops a repeat whose pointer stopped sending', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} repeatMs={100} />)

    streamInPlace(window, 1500)
    fireEvent.pointerEnter(probe())
    streamInPlace(probe(), 600)
    const whileStreaming = onActivate.mock.calls.length
    expect(whileStreaming).toBeGreaterThan(0)

    // A tick that lands inside the stall threshold still fires — at 100ms
    // against 150ms exactly one does. What must not happen is the repeat
    // carrying on, which over this second would be ten more.
    advance(1000)
    const afterOneSecond = onActivate.mock.calls.length
    expect(afterOneSecond, 'the repeat ran on without a pointer').toBeLessThanOrEqual(whileStreaming + 1)

    advance(2000)
    expect(onActivate.mock.calls.length, 'the repeat came back to life').toBe(afterOneSecond)
  })

  /**
   * Uninterrupted is part of the signature. Twenty nudges spread over a second
   * and a half, with pauses between them, is somebody positioning a mouse by
   * hand — and their pointer is silent between the nudges, which is exactly the
   * state this must never read as absence.
   */
  it('leaves a pointer that moves in nudges alone', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    for (let burst = 0; burst < 2; burst++) {
      for (let i = 0; i < 10; i++) {
        fireEvent.pointerMove(window, { clientX: 400 + (i % 2), clientY: 300 })
        advance(33)
      }
      advance(400)
    }

    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate, 'a hand nudging a mouse was taken for a tracker').toHaveBeenCalledTimes(1)
  })

  /**
   * A tracked pointer keeps sending for as long as it exists, so "there has
   * been movement" cannot be allowed to mean "arm again" — a control rested on
   * would fire over and over, thirty times a second.
   */
  it('fires once however long the stream rests on it', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    streamInPlace(window, 1500)
    fireEvent.pointerEnter(probe())
    streamInPlace(probe(), 3000)

    expect(onActivate, 'movement re-armed a control that had already fired').toHaveBeenCalledTimes(1)
  })

  /**
   * The classification is of a *device*, and a device can be swapped. Nothing
   * is claimed about a pointer that has not been seen streaming lately —
   * otherwise a tracker unplugged in favour of a mouse would leave every dwell
   * held back for good.
   */
  it('forgets a pointer it has not seen stream for a long time', () => {
    const onActivate = vi.fn()
    render(<Probe onActivate={onActivate} />)

    streamInPlace(window, 1500)
    advance(11_000)

    fireEvent.pointerEnter(probe())
    advance(500)
    expect(onActivate, 'a classification outlived the pointer it was made about').toHaveBeenCalledTimes(1)
  })

  it('stops promising a firing it is not going to make', () => {
    render(<Probe onActivate={vi.fn()} />)

    streamInPlace(window, 1500)
    fireEvent.pointerEnter(probe())
    advance(500)

    expect(probe().dataset.active).toBe('false')
  })
})

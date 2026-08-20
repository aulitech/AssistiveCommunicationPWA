import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { useDwellControl } from '../../src/ui/dwell'

function Probe({ onActivate, durationMs = 500, disabled = false, repeatMs }: {
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
afterEach(() => vi.useRealTimers())

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

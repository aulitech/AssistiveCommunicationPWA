// When the device stops keeping what is changed — a full store, a private
// window. The board has to go on working from memory, and has to say, and stay
// saying, that what is changed now will not survive a reload.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { downloads } from '../setup'
import { $, click, editToggle, renderApp, savePhrase, writePhrase } from './harness'

let refused: ReturnType<typeof vi.spyOn> | null = null
/** Every write from here on refused, the way a full store refuses them. */
const storageRefuses = () => {
  refused = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  })
}
afterEach(() => {
  refused?.mockRestore()
  refused = null
})

const strip = () => $('.not-keeping')
/**
 * The strip arrives at the top and moves everything under a pointer that has
 * not moved, so the app is deaf for the second after — a click included.
 */
const pastTheHold = () => act(() => void vi.advanceTimersByTime(1100))
const keepButton = () => $('.not-keeping .panel-btn')

/**
 * A phrase saved while nothing can be kept. Entering edit mode is the first
 * refused write — the mode is a setting — so the strip arrives there, and the
 * save waits out its hold the way a person's next dwell would.
 */
const saveWhileRefused = (text: string) => {
  storageRefuses()
  click(editToggle())
  pastTheHold()
  writePhrase(text)
  savePhrase()
}

describe('when this device stops saving', () => {
  /**
   * Regression guard, and the reason for all of it: a refused write threw from
   * inside a state update and unmounted the app — a blank page, the emergency
   * bar with it.
   */
  it('keeps the board on screen when a change cannot be saved', () => {
    renderApp()

    expect(() => saveWhileRefused('Written while nothing could be kept')).not.toThrow()

    expect($('.app'), 'the app went with the write').not.toBeNull()
    expect($('.still-talking'), 'it fell back to the crash screen').toBeNull()
    // Saved to memory, where the board is read from: the toast says it landed.
    expect($('.toast')?.textContent).toMatch(/added to/i)
  })

  it('says so, in a strip that stays', () => {
    renderApp()
    saveWhileRefused('Written while nothing could be kept')

    expect(strip()?.textContent).toMatch(/stopped saving/i)
    // A toast would be gone before a gaze reached it. This is still here after
    // several more dwells.
    pastTheHold()
    click(editToggle())
    click(editToggle())
    expect(strip()).not.toBeNull()
  })

  /**
   * **From memory, not from storage.** Storage is what stopped taking changes,
   * so a backup read from it would leave out exactly the ones at risk.
   */
  it('backs up what is in memory, the unsaved change included', () => {
    renderApp()
    saveWhileRefused('Written while nothing could be kept')

    click(keepButton())

    expect(downloads).toHaveLength(1)
    expect(downloads[0].text).toContain('Written while nothing could be kept')
    expect(keepButton()?.getAttribute('aria-label')).toBe('Backup saved')
  })

  it('says nothing while the device is saving', () => {
    renderApp()
    click(editToggle())
    writePhrase('Written and kept')
    savePhrase()

    expect(strip()).toBeNull()
  })
})

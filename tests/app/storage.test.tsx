// When the device stops keeping what is changed — a full store, a private
// window. The board has to go on working from memory, and has to say, and stay
// saying, that what is changed now will not survive a reload.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { downloads } from '../setup'
import { $, $$, box, cells, click, editToggle, renderApp, savePhrase, writePhrase } from './harness'

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
const tabNamed = (name: string) => $$('.filter-tab[role="tab"]').find(t => t.textContent === name)
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

  /**
   * The strip arrives at the top and moves every cell down under a pointer
   * that has not moved, and in edit mode the one that lands underneath would
   * open for rewording on nobody's say-so.
   */
  it('holds the dwells as the strip arrives', () => {
    renderApp()
    storageRefuses()
    click(editToggle())

    fireEvent.pointerEnter(cells()[0])
    act(() => void vi.advanceTimersByTime(1600))

    expect(box().value, 'a phrase opened under a pointer that had not moved').toBe('')
  })

  it('says nothing while the device is saving', () => {
    renderApp()
    click(editToggle())
    writePhrase('Written and kept')
    savePhrase()

    expect(strip()).toBeNull()
  })
})

/**
 * Regression guard, found in a browser: a phrase whose words were not words
 * reached the parser while the board was drawn, and the board threw — on every
 * load, since the damage stays put. The crash screen caught it, and *Start
 * again* only started the crash again.
 */
describe('a phrase store with something damaged in it', () => {
  it('opens the board, without the damaged phrase', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({
        custom: [
          { id: 'custom-broken', text: 123, category: 'Kitchen' },
          { id: 'custom-kettle', text: 'Put the kettle on', category: 'Kitchen' },
        ],
      }),
    )
    renderApp()

    expect($('.still-talking'), 'the board fell over on a damaged phrase').toBeNull()
    expect($('.app')).not.toBeNull()
    click(tabNamed('Kitchen'))
    expect(cells().map(c => c.textContent)).toEqual(['Put the kettle on'])
  })
})

// What is on screen when the app itself has failed.
//
// It used to be nothing: a render that threw unmounted the whole tree, the
// emergency bar with it. The talk screen is replaced here by one that throws —
// with a phrase in its message, to prove the message never reaches the console.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloads, spoken, warnings } from '../setup'
import { $, $$, click, mount } from './harness'

vi.mock('../../src/talk/talk', () => ({
  TalkScreen: () => {
    throw new TypeError('Could not read "I need my inhaler"')
  },
}))

let reload: ReturnType<typeof vi.fn>
let quiet: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  // React reports a caught error to the console itself, which is right in a
  // browser and only noise here.
  quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    configurable: true,
    writable: true,
  })
})
afterEach(() => quiet.mockRestore())

/** Signed in, so the screen that throws is the one that renders. */
const openTheBoard = () => {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  mount()
}
const buttons = () => $$('.still-talking .emergency-btn')
const labels = () => buttons().map(b => b.textContent)
const action = (label: string) =>
  $$('.still-talking-actions .panel-btn').find(b => b.getAttribute('aria-label') === label)

describe('when the app itself fails', () => {
  it('puts up the emergency bar rather than a blank page', () => {
    openTheBoard()

    expect($('.still-talking')).not.toBeNull()
    expect(labels()).toContain('Help me!')
  })

  it('still speaks from it', () => {
    openTheBoard()

    click(buttons().find(b => b.textContent === 'Help me!'))

    expect(spoken).toContain('Help me!')
  })

  // The bar somebody reaches for without reading has to be the one they
  // arranged, reworded phrases and all, where it can still be read.
  it('offers the bar as this person arranged it', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({
        custom: [{ id: 'custom-sister', text: 'Call my sister', category: 'Emergency' }],
        overrides: { 'em-0': 'Help me, please!' },
      }),
    )
    openTheBoard()

    expect(labels()).toContain('Help me, please!')
    expect(labels()).toContain('Call my sister')
    expect(labels()).not.toContain('Help me!')
  })

  // An empty bar is no bar. Somebody who took every one of them off still
  // gets the six Peri ships on the one screen where nothing else works.
  it('falls back to the phrases Peri ships where nothing would be left', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ hidden: ['em-0', 'em-1', 'em-2', 'em-3', 'em-4', 'em-5'] }),
    )
    openTheBoard()

    expect(labels()).toContain('Help me!')
  })

  // What kind of failure, and nothing it said: a message can carry somebody's
  // words, and a console ends up in screenshots.
  it('reports what kind of failure, never what it said', () => {
    openTheBoard()

    const said = warnings.join(' ')
    expect(said).toContain('TypeError')
    expect(said).not.toContain('inhaler')
  })

  it('starts again', () => {
    openTheBoard()

    click(action('Start again'))

    expect(reload).toHaveBeenCalled()
  })

  /**
   * From storage, not from the screen that failed — memory is what broke. With
   * every write kept or reported, storage is every change there was.
   */
  it('saves a backup of the board as it was last kept', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ custom: [{ id: 'custom-kettle', text: 'Put the kettle on', category: 'Kitchen' }] }),
    )
    openTheBoard()

    click(action('Save a backup first'))

    expect(downloads).toHaveLength(1)
    expect(downloads[0].text).toContain('Put the kettle on')
    expect(action('Backup saved')).toBeDefined()
  })
})

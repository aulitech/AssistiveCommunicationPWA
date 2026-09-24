// Settings: the values somebody sets, putting them back, and the row that synchronizes two devices.
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, act } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { downloads } from '../setup'
import { $$, $, settle, click, mount, renderApp, writeIn } from './harness'
import { stylesheet } from '../stylesheet'

// How fast a held control fires again — the scroll nudges, the filter arrows, the
// settings spinners. The wait before the *first* fire is the action dwell, the
// same as any other control; this is only the gap between that one and the next.
// It was two hardcoded numbers, 180 and 200, until it became a setting.
describe('the auto-repeat delay', () => {
  const railBtn = (label: string) =>
    $$('.grid-scrollbar .scroll-btn').find(b => b.getAttribute('aria-label') === label)!
  const settingRow = (label: string) =>
    $$('.setting-row').find(r => r.querySelector('.setting-label')?.textContent === label)!

  it('paces the repeats of a held control', () => {
    renderApp({ actionDwellMs: 300, repeatDelayMs: 500 })
    const scrollBy = vi.fn()
    $<HTMLElement>('.grid-wrapper')!.scrollBy = scrollBy

    fireEvent.pointerEnter(railBtn('Scroll down'))
    act(() => void vi.advanceTimersByTime(300)) // the dwell itself, not a repeat
    expect(scrollBy).toHaveBeenCalledTimes(1)

    act(() => void vi.advanceTimersByTime(499))
    expect(scrollBy, 'repeated before the delay was up').toHaveBeenCalledTimes(1)

    act(() => void vi.advanceTimersByTime(1))
    expect(scrollBy).toHaveBeenCalledTimes(2)
  })

  // Separate from the dwell time because they answer different questions: the
  // dwell is how long somebody needs to settle on a target, this is how fast they
  // travel once they have. A long dwell with quick repeats is a real combination.
  it('is set independently of the action dwell', () => {
    renderApp({ actionDwellMs: 2000, repeatDelayMs: 100 })
    const scrollBy = vi.fn()
    $<HTMLElement>('.grid-wrapper')!.scrollBy = scrollBy

    fireEvent.pointerEnter(railBtn('Scroll down'))
    act(() => void vi.advanceTimersByTime(1999))
    expect(scrollBy, 'fired before the long dwell was up').not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1 + 300))
    expect(scrollBy.mock.calls.length, 'the quick repeats did not follow').toBeGreaterThan(3)
  })

  it('is offered in Settings and kept', () => {
    renderApp()
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Open menu'))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))

    const row = settingRow('Auto-repeat')
    expect(row, 'no Auto-repeat row in Settings').toBeDefined()
    click([...row.querySelectorAll('.step-btn')].find(b => b.getAttribute('aria-label') === 'Increase'))

    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).repeatDelayMs).toBe(
      DEFAULT_SETTINGS.repeatDelayMs + 50,
    )
  })
})

describe('the synchronize setting', () => {
  const openSettings = () => {
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const row = () => $('.sync-row')!
  const note = () => [...row().querySelectorAll('p')].map(p => p.textContent).join(' ')
  const stored = () => JSON.parse(localStorage.getItem('peri_sync') ?? 'null')

  /**
   * Signed in properly, which is what "the same account" needs — `renderApp`
   * seeds a guest, and a guest has no account for a second device to share.
   */
  const renderSignedIn = () => {
    localStorage.setItem(
      'dwellspeak_user',
      JSON.stringify({ name: 'Ada', email: 'ada@example.com', provider: 'google', sub: '1234' }),
    )
    mount()
    settle()
  }

  it('is off, and says so, on a board nobody has asked to synchronize', () => {
    renderSignedIn()
    openSettings()

    expect(row(), 'the setting is not in the panel').not.toBeNull()
    expect(note()).toContain('This board stays on this device')
    expect(stored()?.enabled ?? false).toBe(false)
  })

  // A guest is only ever this device: there is no account for a second one to
  // share, so the row says what to do rather than offering a passphrase that
  // would mean nothing.
  it('has nothing to synchronize with for a guest', () => {
    renderApp()
    openSettings()

    click($$('.panel-btn').find(b => b.getAttribute('aria-label') === 'Start'))
    expect(note()).toContain('Sign in')
    expect(stored()?.enabled ?? false).toBe(false)
  })

  it('takes a passphrase and remembers it', () => {
    renderSignedIn()
    openSettings()

    const field = row().querySelector('input')!
    expect(field.type, 'a passphrase is not for reading over a shoulder').toBe('password')
    writeIn(field, 'the cat sat down')
    click($$('.panel-btn').find(b => b.getAttribute('aria-label') === 'Start'))

    expect(stored().enabled).toBe(true)
    expect(stored().passphrase).toBe('the cat sat down')
    // And the device has a name of its own, which is what says who wrote last.
    expect(stored().device).toMatch(/^[0-9a-f]{8}$/)
  })

  /**
   * Two buttons stop it, and which is which has to be obvious at a glance: one
   * stops this device, the other stops this device *and* erases the copy every
   * other one is reading. They sit together, graded, so the larger is never the
   * one nearer to hand.
   */
  it('offers stopping here and stopping everywhere, in that order', () => {
    renderSignedIn()
    openSettings()
    writeIn(row().querySelector('.secret-input')!, 'the cat sat down')
    click([...row().querySelectorAll('.panel-btn')].find(b => b.getAttribute('aria-label') === 'Start'))

    const actions = [...row().querySelectorAll('.sync-actions .panel-btn')].map(b => b.getAttribute('aria-label'))
    expect(actions).toEqual(['Synchronize now', 'Stop', 'Stop and erase the copy'])
  })

  // Stopping leaves the copy where it is for the other devices, and leaves the
  // passphrase here so it can be started again without retyping it.
  it('stops without erasing anything', () => {
    renderSignedIn()
    openSettings()
    writeIn(row().querySelector('.secret-input')!, 'the cat sat down')
    click([...row().querySelectorAll('.panel-btn')].find(b => b.getAttribute('aria-label') === 'Start'))

    click([...row().querySelectorAll('.panel-btn')].find(b => b.getAttribute('aria-label') === 'Stop'))
    expect(stored().enabled).toBe(false)
    expect(stored().passphrase).toBe('the cat sat down')
  })

  /**
   * The passphrase is wanted on the *second* device, and nobody — including us —
   * can work it out from anything else. A board whose passphrase is forgotten is
   * a board that cannot be reached, so it can be read back off the device that
   * has it.
   */
  describe('reading the passphrase back', () => {
    const field = () => row().querySelector<HTMLInputElement>('.secret-input')!
    // Show and copy are icons, so they are not `.panel-btn` — the name is still
    // on them, which is the whole reason an icon is allowed here.
    const btn = (label: string) =>
      [...row().querySelectorAll('.panel-btn, .secret-btn')].find(b => b.getAttribute('aria-label') === label)

    const turnedOn = () => {
      renderSignedIn()
      openSettings()
      writeIn(field(), 'the cat sat down')
      click(btn('Start'))
    }

    it('hides it until it is asked for, and puts it back', () => {
      turnedOn()

      expect(field().type, 'the passphrase was on screen from the start').toBe('password')
      expect(field().value).toBe('the cat sat down')

      click(btn('Show the passphrase'))
      expect(field().type).toBe('text')

      click(btn('Hide the passphrase'))
      expect(field().type).toBe('password')
    })

    // The usual case: it is wanted on another device, not on this screen. A panel
    // that spans the viewport is a poor place to display it in a room with other
    // people in it, so copying must not require showing.
    it('copies it without showing it', async () => {
      turnedOn()

      click(btn('Copy the passphrase'))
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('the cat sat down')
      // After the copy has finished, not before — the reveal it must not do
      // would land with the promise, and an assertion made first sees nothing.
      await act(async () => {})
      expect(row().textContent).toContain('Copied the passphrase')
      expect(field().type, 'copying revealed it').toBe('password')
    })

    // Reading and writing the clipboard both need permission, and a dwell is a
    // timer with no key press in it — so a refusal is common enough to say out
    // loud rather than swallow.
    it('says so when the clipboard refuses', async () => {
      turnedOn()
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'))

      click(btn('Copy the passphrase'))
      await act(async () => {})
      expect(row().textContent).toContain('could not reach the clipboard')
    })

    // Nothing to show and nothing to copy before one is typed.
    it('offers neither until there is something there', () => {
      renderSignedIn()
      openSettings()

      expect(btn('Show the passphrase')!.getAttribute('aria-disabled')).toBe('true')
      expect(btn('Copy the passphrase')!.getAttribute('aria-disabled')).toBe('true')
    })
  })

  // The passphrase is the key and the address both. A file made to be handed to
  // somebody else must not carry either — the same rule the ElevenLabs key
  // follows, for a larger reason: this one opens every device on the account.
  it('keeps the passphrase out of a backup', () => {
    renderSignedIn()
    openSettings()
    writeIn(row().querySelector('input')!, 'the cat sat down')
    click($$('.panel-btn').find(b => b.getAttribute('aria-label') === 'Start'))

    // Back to the menu, and past the second it is deaf for — a panel closing
    // leaves the pointer sitting over the item that comes back.
    click($('.panel-back'))
    act(() => void vi.advanceTimersByTime(1100))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Backup & sharing'))
    click($$('.panel-btn').find(b => b.getAttribute('aria-label') === 'Save a file'))
    settle()

    expect(downloads.length).toBeGreaterThan(0)
    expect(downloads[downloads.length - 1].text).not.toContain('the cat sat down')
  })
})

// Every settable value carries a revert, and Settings carries one control that
// reverts the lot. The second is the only thing in this app that can take away
// everything somebody wrote, so it asks first — and offers a file before it does.
describe('putting settings back', () => {
  const openSettings = () => {
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Open menu'))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const row = (label: string) =>
    $$('.setting-row').find(r => r.querySelector('.setting-label')?.textContent === label)!
  const stepBtn = (label: string, within: Element) =>
    [...within.querySelectorAll('.step-btn')].find(b => b.getAttribute('aria-label')?.startsWith(label))!
  const confirmBtn = (label: string) =>
    [...document.body.querySelectorAll('.panel-btn')].find(b => b.textContent?.includes(label))

  // The one setting the stylesheet cannot read for itself: every size in it is
  // in `rem`, so this is the root font-size and everything written follows.
  describe('text size', () => {
    it('scales the root font size, and keeps it', () => {
      renderApp()
      expect(document.documentElement.style.fontSize).toBe('100%')

      openSettings()
      click(stepBtn('Increase', row('Text size')))

      expect(document.documentElement.style.fontSize).toBe('110%')
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).zoom).toBeCloseTo(1.1)
    })

    it('comes back at that size after a reload', () => {
      renderApp({ zoom: 1.5 })
      expect(document.documentElement.style.fontSize).toBe('150%')
    })

    // A percentage rather than a pixel count, so it multiplies whatever the
    // reader has already told their browser they want rather than replacing it.
    it("is a multiple of the browser's own size, not a size of its own", () => {
      renderApp({ zoom: 2 })
      expect(document.documentElement.style.fontSize).not.toMatch(/px/)
    })
  })

  /**
   * **The label beside the figures is as wide as the widest thing it can say.**
   * It was 32px whatever it held, which cut `1000ms` to `1000r` and ran `100%`
   * into the + beside it. Fitting it to what it is saying *now* would move the +
   * and the reset every time the value crossed a digit, and those are aimed at by
   * position — so it is sized to what it *could* say, drawn invisibly behind the
   * real value, and a test and a screen reader both still read the value alone.
   */
  describe('the label beside the figures', () => {
    const label = (name: string) => row(name).querySelector<HTMLElement>('.setting-formatted')!

    it('is sized to the widest value its spinner can reach', () => {
      renderApp({ repeatDelayMs: 1000 })
      openSettings()
      // Showing a whole second, sized for one with three figures after the point.
      expect(label('Auto-repeat').textContent).toBe('1s')
      expect(label('Auto-repeat').dataset.widest).toBe('0.100s')
      expect(label('Text size').dataset.widest).toMatch(/^\d{3}%$/)
    })

    // Every time in seconds, with three figures after the point or none — the
    // auto-repeat said `1000ms` while the dwells above it said `1.5s`.
    it('writes every time in seconds', () => {
      renderApp({ phraseDwellMs: 1500, actionDwellMs: 800, repeatDelayMs: 1050 })
      openSettings()
      expect(label('Phrase dwell').textContent).toBe('1.500s')
      expect(label('Action dwell').textContent).toBe('0.800s')
      expect(label('Auto-repeat').textContent).toBe('1.050s')
    })

    // The + and the reset line up down the list rather than each row's sitting
    // where its own widest value put it: a column is a place to aim at.
    it('is never narrower than a time, so every row lines up', () => {
      const css = stylesheet()
      const rule = css.slice(css.indexOf('.setting-formatted {'))
      expect(rule.slice(0, rule.indexOf('}'))).toMatch(/min-width: *6\.5ch/)
    })
  })

  describe('one value at a time', () => {
    it('offers a revert on every value, naming what it goes back to', () => {
      renderApp()
      openSettings()
      const labels = $$('.setting-row .step-btn')
        .map(b => b.getAttribute('aria-label'))
        .filter((l): l is string => !!l && l.startsWith('Reset '))
      expect(labels).toEqual([
        'Reset text size to 100%',
        // Every time in seconds, with three figures after the point or none.
        'Reset phrase dwell to 1.500s',
        'Reset action dwell to 0.800s',
        'Reset auto-repeat to 1s',
        'Reset volume to 100%',
        'Reset speed to 1.0×',
      ])
    })

    it('puts a changed value back and keeps it there', () => {
      renderApp({ phraseDwellMs: 2500 })
      openSettings()
      const dwell = row('Phrase dwell')
      expect(dwell.querySelector<HTMLInputElement>('.setting-number')!.value).toBe('2500')

      click(stepBtn('Reset phrase dwell', dwell))

      expect(dwell.querySelector<HTMLInputElement>('.setting-number')!.value).toBe('1500')
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).phraseDwellMs).toBe(1500)
    })

    // Quiet rather than gone: a row that changed width as a value crossed its
    // default would move the two buttons beside it, and a control somebody has
    // learnt to find should be in the same place whether or not it can do anything.
    it('goes quiet at the default rather than away', () => {
      renderApp()
      openSettings()
      const dwell = row('Phrase dwell')
      const revert = stepBtn('Reset phrase dwell', dwell)

      expect(revert.getAttribute('aria-disabled')).toBe('true')
      expect($$('.setting-row .step-btn').length, 'a control went missing').toBe(18)
    })
  })

  describe('all of it at once', () => {
    /** jsdom implements no navigation, so the reload is watched rather than run. */
    const watchReload = () => {
      const reload = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload },
        configurable: true,
        writable: true,
      })
      return reload
    }

    const seedSomething = () => {
      localStorage.setItem('peri_sent', JSON.stringify([{ text: 'said this', at: 1 }]))
      localStorage.setItem('peri_elevenlabs', JSON.stringify({ apiKey: 'k', voices: [] }))
      localStorage.setItem('dwellspeak_profile', JSON.stringify({ contacts: ['Mum'], name: {} }))
    }

    it('asks before it does anything', () => {
      renderApp({ phraseDwellMs: 2500 })
      seedSomething()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))

      expect(document.body.querySelector('.confirm-modal')).not.toBeNull()
      // Nothing has gone yet.
      expect(localStorage.getItem('peri_sent')).not.toBeNull()
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).phraseDwellMs).toBe(2500)
    })

    it('leaves everything alone when cancelled', () => {
      renderApp({ phraseDwellMs: 2500 })
      seedSomething()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))
      click(confirmBtn('Cancel'))

      expect(document.body.querySelector('.confirm-modal')).toBeNull()
      expect(localStorage.getItem('peri_sent')).not.toBeNull()
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).phraseDwellMs).toBe(2500)
    })

    it('clears everything it wrote, and reloads so nothing stale is left showing', () => {
      renderApp({ phraseDwellMs: 2500 })
      seedSomething()
      const reload = watchReload()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))
      click(confirmBtn('Reset everything'))

      for (const key of [
        'dwellspeak_settings',
        'dwellspeak_phrase_store_v2',
        'dwellspeak_profile',
        'peri_elevenlabs',
        'peri_sent',
        'peri_recent',
      ]) {
        expect(localStorage.getItem(key), `${key} survived the reset`).toBeNull()
      }
      expect(reload).toHaveBeenCalled()
    })

    // Signing out is its own item with its own confirmation. Dropping somebody at
    // the sign-in page is not what they asked for when they asked for a reset.
    it('leaves them signed in', () => {
      renderApp()
      watchReload()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))
      click(confirmBtn('Reset everything'))

      expect(localStorage.getItem('dwellspeak_user')).not.toBeNull()
    })

    // Deleting a phrase is the one change with no road back, and this deletes all
    // of them, so a file to keep is the first thing on offer.
    it('offers a backup before wiping, and says it saved one', () => {
      renderApp({ phraseDwellMs: 2500 })
      seedSomething()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))
      click(confirmBtn('Export a backup first'))

      expect(downloads.length, 'no file was offered').toBeGreaterThan(0)
      expect(document.body.querySelector('.confirm-ok')?.textContent).toMatch(/^Saved as peri-backup/)
      // Offering is not doing: the device is still whole until they say so.
      expect(localStorage.getItem('peri_sent')).not.toBeNull()
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).phraseDwellMs).toBe(2500)
    })
  })
})

/**
 * The waiting indicator is wired to two things that are usually instant, so
 * what the app can be held to here is the opposite claim: a board that opens
 * with nothing to wait for says nothing. Its own delay and its lifecycle are
 * `tests/ui/busy.test.tsx`.
 */
describe('the waiting indicator', () => {
  it('says nothing on a board with nothing to wait for', () => {
    renderApp()
    act(() => void vi.advanceTimersByTime(2000))

    const region = $('.busy-region')
    expect(region, 'the live region is missing, so nothing can ever be announced').not.toBeNull()
    expect(region?.textContent, 'a fresh board claimed to be busy').toBe('')
  })
})

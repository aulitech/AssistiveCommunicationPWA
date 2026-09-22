// Whose board is on the screen. **A board is the signed-in person's and nobody
// else's**: another account signing in on the same device, or a guest, gets a
// board of its own and never sees this one. They all shared one until this was
// written — every account signed in on a device opened the same phrases, lists,
// keys and Sent list.
//
// `core/store.test.ts` drives every piece of a board through storage under two
// accounts; this drives the screens, which is where somebody would actually see
// another person's board.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import App from '../../src/App'
import { type User } from '../../src/core/store'
import { spoken } from '../setup'

let container: HTMLElement
const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]
const inBody = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
const settle = () => act(() => void vi.advanceTimersByTime(50))

let pointerAt = 0
function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
  fireEvent.click(el)
  settle()
}

const ada: User = { name: 'Ada Lovelace', email: 'ada@example.com', provider: 'google', sub: '1' }
const bob: User = { name: 'Bob Builder', email: 'bob@example.com', provider: 'facebook', sub: '2' }
const guest: User = { name: 'Guest', email: '', provider: 'guest' }

/** jsdom implements no navigation, so the reload is watched rather than run. */
let reload: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers()
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    configurable: true,
    writable: true,
  })
})
afterEach(() => vi.useRealTimers())

/** A page loaded with this person signed in, or nobody — which is what a reload leaves. */
function loadAs(user: User | null) {
  cleanup()
  if (user) localStorage.setItem('dwellspeak_user', JSON.stringify(user))
  else localStorage.removeItem('dwellspeak_user')
  container = render(<App />).container
  settle()
}

const cells = () => $$('.phrase-cell')
const tab = (name: string) => $$('.filter-tab[role="tab"]').find(el => el.textContent === name)
const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
const panelBtn = (label: string) => inBody('.panel-btn').find(b => b.getAttribute('aria-label') === label)

/**
 * Says a phrase off the board, as the board opens — in auto-speak, where one
 * dwell says it and it goes under Sent. A different one for each person, so
 * whose Sent list it landed in cannot be mistaken.
 */
function sayOne(nth: number): string {
  const plain = cells().filter(c => !c.querySelector('.phrase-slot'))
  click(plain[nth])
  return spoken.at(-1)!
}
const sent = () => {
  click(tab('Sent'))
  return cells().map(c => c.textContent)
}

const continueAsGuest = () =>
  click($$('.auth-btn').find(b => b.getAttribute('aria-label') === 'Continue as guest'))

function signOut() {
  openMenu()
  click(nav('Sign out'))
  click(panelBtn('Sign out'))
}

describe('two people on one device', () => {
  it('each open their own board, and never the other’s', () => {
    loadAs(ada)
    const adaSaid = sayOne(0)
    expect(sent()).toEqual([adaSaid])

    loadAs(bob)
    expect(sent(), 'the second account opened the first one’s board').toEqual([])
    click(tab('All'))
    expect(sayOne(1)).not.toBe(adaSaid)

    loadAs(ada)
    expect(sent(), 'the second account’s board reached the first one’s').toEqual([adaSaid])
  })

  // Every guest is one guest, which is exactly why no account's board may be a
  // guest's: anybody at all can continue as one.
  it('keep the guest’s board apart from an account’s', () => {
    loadAs(ada)
    const adaSaid = sayOne(0)

    loadAs(guest)
    expect(sent(), 'a guest opened an account’s board').toEqual([])
    click(tab('All'))
    sayOne(1)

    loadAs(ada)
    expect(sent(), 'the guest’s board reached an account’s').toEqual([adaSaid])
  })

  // The board on the device from before boards were kept apart. Whoever was
  // using it is signed in as the new release first runs, and it is theirs.
  it('leaves the board already on the device with whoever was using it', () => {
    localStorage.setItem('peri_sent', JSON.stringify([{ id: 's0', text: 'Said before the update' }]))
    loadAs(ada)
    expect(sent()).toEqual(['Said before the update'])
    loadAs(bob)
    expect(sent()).toEqual([])
  })
})

describe('signing out', () => {
  // A board is held in memory as well as in storage, and a request still on
  // its way writes wherever storage points when it lands.
  it('reloads, so nothing of the board is left in memory for whoever is next', () => {
    loadAs(ada)
    signOut()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('dwellspeak_user')).toBeNull()
  })

  // Reloaded or not, signing in opens the board of whoever signed in.
  it('leaves the next person to sign in their own board', () => {
    loadAs(ada)
    const adaSaid = sayOne(0)
    expect(sent()).toEqual([adaSaid])
    signOut()
    continueAsGuest()

    expect($('.app')).not.toBeNull()
    expect(sent(), 'the guest after an account signed out opened the account’s board').toEqual([])
  })

  it('tells an account its board is its own', () => {
    loadAs(ada)
    openMenu()
    click(nav('Sign out'))
    expect(inBody('.confirm-note')[0].textContent).toMatch(/only this account can open them/)
  })

  // The one board that is not protected, and the confirmation is where to say so.
  it('tells a guest that the next guest will see theirs', () => {
    loadAs(guest)
    openMenu()
    click(nav('Sign out'))
    expect(inBody('.confirm-note')[0].textContent).toMatch(/whoever continues as a guest/)
  })
})

// The sign-in page is nobody's board, and has to be worked by whoever is at it.
describe('how the sign-in page is worked', () => {
  const fontSize = () => document.documentElement.style.fontSize
  const dwellValue = () => $<HTMLInputElement>('.signin-dwell [aria-label="dwell time value"]')!.value
  const more = () => $$('.signin-dwell .step-btn').find(b => b.getAttribute('aria-label') === 'Increase')

  it('reads nothing of anybody’s board', () => {
    loadAs(ada)
    localStorage.setItem('dwellspeak_settings', JSON.stringify({ zoom: 1.5, actionDwellMs: 1500, language: 'fr' }))
    loadAs(null)
    expect(fontSize(), 'the sign-in page read a board’s settings').toBe('100%')
  })

  // Somebody who needs a slow dwell cannot sign back in at a quick one, and
  // whoever is at the sign-in page next is most often whoever just left it.
  it('is left worked the way the board was by whoever signed out', () => {
    loadAs(ada)
    localStorage.setItem('dwellspeak_settings', JSON.stringify({ zoom: 1.5, actionDwellMs: 1500 }))
    loadAs(ada)
    signOut()
    loadAs(null)

    expect(fontSize()).toBe('150%')
    expect(dwellValue()).toBe('1500')
  })

  // A dwell somebody had to slow down to sign in is a dwell they need on the
  // board too — which is why the control is on the sign-in page at all.
  it('carries into a board opened for the first time, and not into one that has its own', () => {
    loadAs(null)
    expect(dwellValue()).toBe('800')
    click(more())
    click(more())

    // Leaving it is how what the board holds shows: a board that did not start
    // from the sign-in page would leave its own 0.800s behind.
    continueAsGuest()
    signOut()
    loadAs(null)
    expect(dwellValue(), 'a board opened for the first time did not start from the sign-in page').toBe('1000')

    click(more())
    continueAsGuest()
    signOut()
    loadAs(null)
    expect(dwellValue(), 'a board’s own dwell time was replaced by the sign-in page’s').toBe('1000')
  })
})

// A board open in one tab while somebody else signs in in another is a board
// on screen that is not the signed-in person's.
describe('another tab', () => {
  const told = (key: string | null) => act(() => void window.dispatchEvent(new StorageEvent('storage', { key })))

  it('signing somebody else in starts this one again, as them', () => {
    loadAs(ada)
    localStorage.setItem('dwellspeak_user', JSON.stringify(bob))
    told('dwellspeak_user')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('signing out starts this one again, signed out', () => {
    loadAs(ada)
    localStorage.removeItem('dwellspeak_user')
    told('dwellspeak_user')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('clearing the site’s storage starts this one again', () => {
    loadAs(ada)
    localStorage.clear()
    told(null)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('signing in somebody who was signed in already changes nothing here', () => {
    loadAs(ada)
    localStorage.setItem('dwellspeak_user', JSON.stringify({ ...ada, avatar: 'new.png' }))
    told('dwellspeak_user')
    told('dwellspeak_settings')
    expect(reload).not.toHaveBeenCalled()
  })

  // Somebody signed in before accounts had ids has no owner to tell apart from
  // nobody at all, so it is being signed in that is compared.
  it('signing out somebody signed in before accounts had ids starts this one again', () => {
    loadAs({ name: 'Eve', email: 'eve@example.com', provider: 'google' })
    localStorage.removeItem('dwellspeak_user')
    told('dwellspeak_user')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  // Signed out here, and somebody signs in there: this tab's sign-in page is
  // not the screen they signed in to.
  it('signing in while this one is signed out starts it again', () => {
    loadAs(null)
    localStorage.setItem('dwellspeak_user', JSON.stringify(guest))
    told('dwellspeak_user')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

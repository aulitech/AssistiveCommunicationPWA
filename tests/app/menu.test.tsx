// The menu and the panels it opens: what it offers, what it does on the way out, and signing out.
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HELP_SECTIONS } from '../../src/menu/help'
import { scrolledIntoView } from '../setup'
import { $$, $, settle, click, mount, renderApp, cells, modes, plainCell, clearMessage } from './harness'
import { stylesheet } from '../stylesheet'

// The panel spans the viewport, and everything in this menu is aimed at rather
// than read — so where an item is not, and when it will not answer, matter as
// much as where it is.
describe('the menu items', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const back = () => $('.panel-back')

  // jsdom lays nothing out, so this can only check the rule is written. Whether
  // the items actually shrink is a question for the deploy preview.
  it('is no wider than what is written on it', () => {
    const css = stylesheet()
    expect(css).toMatch(/\.panel-nav \{[^}]*\balign-items: flex-start;/)
  })

  // A pointer rests where it last fired. Back sits over the menu that comes
  // back, so without this the item underneath opens on its own — and the item
  // underneath might be Sign out.
  it('ignores a dwell for a second after a panel closes', () => {
    renderApp()
    openMenu()
    click(nav('Settings'))
    expect($('.settings-panel')).not.toBeNull()

    click(back())
    click(nav('Settings'))
    expect($('.settings-panel'), 'the menu reopened on its own').toBeNull()

    // Pinned at both ends, or a guard of a tenth of a second passes this just
    // as well as a guard of one: still deaf just short of the second, and
    // listening again just past it. `click` advances the clock 50ms of its own.
    act(() => void vi.advanceTimersByTime(800))
    click(nav('Settings'))
    expect($('.settings-panel'), 'the guard let go early').toBeNull()

    act(() => void vi.advanceTimersByTime(200))
    click(nav('Settings'))
    expect($('.settings-panel')).not.toBeNull()
  })

  // The sign-out dialog is centred, which puts its buttons squarely over the
  // items — including the one that raised it.
  it('holds the same guard up after the sign-out dialog', () => {
    renderApp()
    openMenu()
    click(nav('Sign out'))
    click(
      [...document.body.querySelectorAll('.panel-btn')].find(
        b => b.getAttribute('aria-label') === 'Stay signed in',
      ),
    )

    click(nav('Sign out'))
    expect(document.body.querySelector('.confirm-modal'), 'it asked again on its own').toBeNull()

    act(() => void vi.advanceTimersByTime(1000))
    click(nav('Sign out'))
    expect(document.body.querySelector('.confirm-modal')).not.toBeNull()
  })
})

describe('help', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const back = () => $('.panel-back')

  it('is offered in the menu', () => {
    renderApp()
    openMenu()
    expect(nav('Help')).toBeDefined()
    expect(nav('Help')?.textContent).toMatch(/how to use/i)
  })

  it('opens the guide', () => {
    renderApp()
    openMenu()
    click(nav('Help'))

    expect($('.help-panel')).not.toBeNull()
    expect($('.help-title')?.textContent).toMatch(/peri/i)
    expect($$('.help-section').length).toBe(HELP_SECTIONS.length)
  })

  // The panel spans the full viewport, so without a constrained column the
  // guide's lines run the whole width of a wide monitor.
  it('keeps the prose in a reading column', () => {
    renderApp()
    openMenu()
    click(nav('Help'))

    const measure = $('.help-measure')
    expect(measure).not.toBeNull()
    // Every piece of prose sits inside it, not loose in the scroll area.
    for (const el of [...$$('.help-text'), ...$$('.help-list'), ...$$('.help-section')]) {
      expect(measure!.contains(el)).toBe(true)
    }
  })

  // Every heading is always there — folded up, the guide is a list of what it
  // can tell you, which is how somebody finds the one thing they came for.
  it('renders every section heading', () => {
    renderApp()
    openMenu()
    click(nav('Help'))

    const headings = $$('.help-section-title').map(h => h.textContent)
    expect(headings).toEqual(HELP_SECTIONS.map(s => s.title))
  })

  describe('folding up', () => {
    const showHelp = () => {
      renderApp()
      openMenu()
      click(nav('Help'))
    }
    const heading = (title: string) => $$('.help-section-title').find(h => h.textContent === title)!
    const openTitles = () => $$('.help-section.is-open .help-section-title').map(h => h.textContent)
    const bodyCount = () => $$('.help-text').length + $$('.help-list').length

    // Open on arrival, so the guide says something rather than only listing what
    // it could say — and the titles of everything else are visible below it.
    it('opens on the first section and no other', () => {
      showHelp()
      expect(openTitles()).toEqual([HELP_SECTIONS[0].title])
      expect(HELP_SECTIONS[0].title).toBe('Overview')
    })

    it('opens the one chosen and closes the one that was open', () => {
      showHelp()
      click(heading('Settings'))

      expect(openTitles()).toEqual(['Settings'])
      expect($$('.help-section.is-open .help-text').length).toBeGreaterThan(0)
    })

    // Opening a section low in the list used to leave its heading where it was,
    // with the text it just revealed below the fold — so the reader had to go
    // and find the scroll arrows to see what they had asked for.
    it('brings a newly opened section to the top of the pane', () => {
      showHelp()
      scrolledIntoView.length = 0

      click(heading('Backup and sharing'))

      const section = $$('.help-section').find(s => s.classList.contains('is-open'))
      expect(scrolledIntoView.at(-1), 'the opened section was not scrolled to').toBe(section)
    })

    // Closing is not going anywhere. Scrolling on the way out would move the page
    // under somebody who had just finished reading it.
    it('does not scroll when a section is closed', () => {
      showHelp()
      click(heading('Backup and sharing'))
      scrolledIntoView.length = 0

      click(heading('Backup and sharing'))
      expect(scrolledIntoView).toEqual([])
    })

    it('closes the open one when it is chosen again', () => {
      showHelp()
      click(heading('Overview'))

      expect(openTitles()).toEqual([])
      expect(bodyCount(), 'a closed guide still had prose in it').toBe(0)
    })

    // Unmounted rather than hidden. Left in the tree, a screen reader would read
    // out fifteen sections the user has closed.
    it("keeps only the open section's prose in the page", () => {
      showHelp()
      const all = HELP_SECTIONS.reduce((n, s) => n + s.blocks.length, 0)
      expect(bodyCount()).toBeLessThan(all)
      expect(bodyCount()).toBe(HELP_SECTIONS[0].blocks.length)
    })

    // The legal pages are the same shape of text drawn by the same component,
    // and they are documents: served at their own URLs, indexed, read by people
    // checking one clause. Folding them would hide most of what they exist to say.
    it('leaves the legal pages open', () => {
      // Restored in `finally`: leaving the URL at /privacy makes every test
      // after this one render the privacy policy instead of the app.
      try {
        window.history.pushState({}, '', '/privacy')
        mount()
        settle()

        expect($('.help-section.is-collapsible')).toBeNull()
        expect($$('.help-section-title').length).toBeGreaterThan(1)
        expect($$('.help-text').length).toBeGreaterThan(5)
      } finally {
        window.history.pushState({}, '', '/')
      }
    })
  })

  // Settings, the guide and Backup & sharing take the whole screen; the menu
  // and Aliases hang down only as far as their content. jsdom lays nothing out,
  // so the class is what can be checked — the height it carries is the
  // preview's question.
  it.each([
    ['Settings', true],
    ['Help', true],
    ['Backup & sharing', true],
    ['Aliases', false],
  ])('gives %s the full viewport: %s', (panel, tall) => {
    renderApp()
    openMenu()
    expect($('.top-panel')?.classList.contains('is-tall'), 'the menu itself is not tall').toBe(false)

    click(nav(panel))
    expect($('.top-panel')?.classList.contains('is-tall')).toBe(tall)
  })

  it('goes back to the menu', () => {
    renderApp()
    openMenu()
    click(nav('Help'))
    click(back())

    expect($('.help-panel')).toBeNull()
    expect(nav('Help')).toBeDefined()
  })

  it('reopens on the menu rather than back inside the guide', () => {
    renderApp()
    openMenu()
    click(nav('Help'))
    openMenu() // close
    openMenu() // reopen

    expect($('.help-panel')).toBeNull()
  })
})

describe('leaving a panel', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const back = () => $('.panel-back')
  const isOpen = () => $('.top-panel.open') !== null
  const PANELS = ['Settings', 'Aliases', 'Backup & sharing', 'Help']
  const SCREENS = ['Menu', ...PANELS]

  const show = (screen: string) => {
    renderApp()
    openMenu()
    if (screen !== 'Menu') click(nav(screen))
  }

  // The panels are different heights, and the way out used to sit under their
  // content — so it moved whenever the content did. A target a gaze user has to
  // find again each time is a poor one, so it lives in the row above instead,
  // which is the same place on every screen the menu can show.
  it.each(SCREENS)('offers Back in the top right of %s', screen => {
    show(screen)

    const row = $('.panel-user-row')!
    expect(row.contains(back()!), 'Back is not in the top row').toBe(true)
    expect(row.lastElementChild).toBe(back())
  })

  /**
   * **Which app and which release, centred on the top line** — the first thing
   * anybody helping with a board over the phone asks. The version is the one in
   * `package.json`, put into the bundle at build time, so it cannot drift from
   * the release it names. The same row on every screen the menu shows, between
   * whoever is signed in and the way out.
   */
  it.each(SCREENS)('names the app and its version in the middle of the top line of %s', screen => {
    const { version } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      version: string
    }
    show(screen)

    const row = [...$('.panel-user-row')!.children]
    expect(row.map(el => el.className.split(' ')[0])).toEqual(['panel-user', 'panel-title', 'panel-back'])
    expect($('.panel-title-name')!.textContent).toBe('Peri')
    expect($('.panel-version')!.textContent).toBe(version)
  })

  // The sizes asked for, and the grid that centres them without ever laying the
  // title over Back: the outer columns share the slack equally, and Back's is
  // never narrower than Back. jsdom lays nothing out, so the stylesheet is what
  // can be read.
  it('sets the name at 1.3rem and the version at 0.8rem, centred without crowding Back', () => {
    const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
    const value = (selector: string, prop: string) => {
      const rule = css.slice(css.indexOf(`${selector} {`))
      return rule.slice(0, rule.indexOf('}')).match(new RegExp(`\\b${prop}: *([^;]+);`))?.[1]
    }
    expect(value('.panel-title-name', 'font-size')).toBe('1.3rem')
    expect(value('.panel-version', 'font-size')).toBe('0.8rem')
    expect(value('.panel-user-row', 'grid-template-columns')).toBe('minmax(0, 1fr) auto minmax(max-content, 1fr)')
    expect(value('.panel-back', 'justify-self')).toBe('end')
  })

  it.each(PANELS)('returns to the menu from %s', panel => {
    show(panel)
    click(back())

    expect(nav('Settings')).toBeDefined()
    expect(isOpen()).toBe(true)
  })

  // One step further out. With the scrim inert this is the only way back to the
  // phrases that does not need a keyboard.
  it('closes the menu from the menu itself', () => {
    show('Menu')
    expect(isOpen()).toBe(true)

    click(back())

    expect(isOpen()).toBe(false)
  })

  it('answers a dwell, a tap and a key like every other control', () => {
    show('Settings')

    expect(back()?.getAttribute('role')).toBe('button')
    expect(back()?.getAttribute('tabindex')).toBe('0')

    fireEvent.pointerEnter(back()!)
    act(() => void vi.advanceTimersByTime(800))
    settle()
    expect(nav('Settings'), 'a dwell did not go back').toBeDefined()

    click(nav('Settings'))
    fireEvent.keyDown(back()!, { key: 'Enter' })
    settle()
    expect(nav('Settings'), 'a key did not go back').toBeDefined()
  })
})

describe('the scrim behind the menu', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const isOpen = () => $('.top-panel.open') !== null

  // Moving across the scrim used to close the panel after 600ms, so a pointer
  // wandering on its way to the menu took the menu away again — and a gaze user
  // has no way to move without pointing at something.
  it('stays open however long the pointer rests on it', () => {
    renderApp()
    openMenu()

    const scrim = $('.panel-scrim')!
    fireEvent.pointerMove(scrim)
    act(() => void vi.advanceTimersByTime(5000))
    settle()

    expect(isOpen()).toBe(true)
  })

  it('stays open when the scrim is clicked', () => {
    renderApp()
    openMenu()

    click($('.panel-scrim'))

    expect(isOpen()).toBe(true)
  })

  // It is still in the way on purpose: a phrase behind it must not answer to a
  // dwell that lands on it. jsdom applies no stylesheet, so the rule itself is
  // what there is to check.
  it('keeps the phrases underneath from being reached', () => {
    const css = stylesheet()
    const open = css.slice(css.indexOf('.panel-scrim.open {'))
    expect(open.slice(0, open.indexOf('}'))).toMatch(/pointer-events:\s*auto/)
  })

  // Escape is neither a click nor a dwell, and anyone at a keyboard expects it.
  it('still closes on Escape', () => {
    renderApp()
    openMenu()

    fireEvent.keyDown(window, { key: 'Escape' })
    settle()

    expect(isOpen()).toBe(false)
  })
})

describe('signing out', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const confirm = () => inDoc('.confirm-modal')[0] ?? null
  const action = (label: string) => inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === label)
  const signedIn = () => localStorage.getItem('dwellspeak_user') !== null
  const start = () => {
    renderApp()
    openMenu()
    click(nav('Sign out'))
  }

  // One dwell away from every other thing in the menu, and the one that empties
  // the screen.
  it('asks before it does anything', () => {
    start()

    expect(confirm()).not.toBeNull()
    expect(signedIn()).toBe(true)
    expect($('.app')).not.toBeNull()
  })

  // Somebody whose board is how they speak has every reason to think a button
  // called Sign out might take it away.
  it('says what it will not do', () => {
    start()
    expect(confirm()?.textContent).toMatch(/stay on this device/i)
  })

  it('signs out when confirmed', () => {
    start()
    click(action('Sign out'))

    expect(signedIn()).toBe(false)
    expect($('.signin-page')).not.toBeNull()
  })

  it('stays put when declined', () => {
    start()
    click(action('Stay signed in'))

    expect(confirm()).toBeNull()
    expect(signedIn()).toBe(true)
    expect($('.app')).not.toBeNull()
  })

  it('stays put on Escape', () => {
    start()
    fireEvent.keyDown(window, { key: 'Escape' })
    settle()

    expect(confirm()).toBeNull()
    expect(signedIn()).toBe(true)
  })

  // A pointer rests where it last fired. If the confirmation appeared inside the
  // panel, under the nav item that opened it, the pointer already sitting there
  // would answer it.
  it('puts the confirmation outside the menu panel', () => {
    start()
    const scrim = inDoc('.confirm-scrim')[0]
    expect(scrim).toBeDefined()
    expect($('.top-panel')!.contains(scrim)).toBe(false)
    expect(scrim.parentElement).toBe(document.body)
  })

  it('leaves the phrases and settings alone either way', () => {
    renderApp()
    click(plainCell())
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak'))
    clearMessage()
    const store = localStorage.getItem('peri_sent')

    openMenu()
    click(nav('Sign out'))
    click(action('Sign out'))

    expect(signedIn()).toBe(false)
    expect(localStorage.getItem('peri_sent')).toBe(store)
  })
})

describe('reaching all of a panel that has grown', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const arrows = () => $$('.pane-scroll-btn').map(b => b.getAttribute('aria-label'))

  /** jsdom lays nothing out, so the overflow the arrows react to is supplied. */
  const overflow = (pane: Element) => {
    for (const [k, v] of Object.entries({ scrollTop: 200, clientHeight: 400, scrollHeight: 1200 })) {
      Object.defineProperty(pane, k, { value: v, configurable: true })
    }
    fireEvent.scroll(pane)
    settle()
  }

  // Aliases grows with every word added, and Settings with the linked account
  // row. A panel taller than the screen is a panel whose bottom half a
  // dwell user cannot reach — there is no wheel and no scrollbar.
  it.each(['Aliases', 'Settings'])('scrolls %s once there is more than fits', panel => {
    renderApp()
    openMenu()
    click(nav(panel))

    const pane = $('.settings-body')
    expect(pane, `${panel} has no scrolling pane`).not.toBeNull()
    expect(arrows()).toEqual([])

    overflow(pane!)
    expect(arrows()).toEqual(['Go to top', 'Scroll up', 'Scroll down', 'Go to bottom'])
  })

  // A pane fills whatever height it is given, so a panel that hangs down as far
  // as its own content can never overflow: the arrows never appear and anything
  // past the bottom of the screen is simply out of reach, there being no wheel
  // and no scrollbar here. Settings and the guide are given the viewport; the
  // two that hang from the menu bound themselves instead. Whether it *looks*
  // right is a question for the deploy preview — that a bound exists is not.
  it('bounds the Aliases panel, so its pane has somewhere to overflow into', () => {
    renderApp()
    openMenu()
    click(nav('Aliases'))
    expect($('.alias-panel'), 'the Aliases panel fills its parent instead').not.toBeNull()

    const css = stylesheet()
    expect(css).toContain('.alias-panel {')
    const rule = css.slice(css.indexOf('.alias-panel {'))
    // `dvh` as well: on a phone `vh` is the viewport with the browser's chrome
    // hidden, so a panel bounded in it still runs under the address bar.
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/max-height:\s*calc\(100dvh/)
  })

  it('scrolls the panel when an arrow is dwelled', () => {
    renderApp()
    openMenu()
    click(nav('Aliases'))

    const pane = $('.settings-body')!
    overflow(pane)
    const scrollBy = vi.fn()
    pane.scrollBy = scrollBy

    click($$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === 'Scroll down'))
    expect(scrollBy).toHaveBeenCalledWith({ top: 100, behavior: 'smooth' })
  })
})

describe('the menu panels on a wide screen', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)

  // The panel spans the whole viewport. Without a column, a setting's label sits
  // at one edge of a wide monitor and its control at the other, and the guide's
  // lines run a couple of hundred characters. All four hold the same measure so
  // they line up as you move between them.
  it.each([
    ['Settings', '.settings-body'],
    ['Aliases', '.settings-body'],
    ['Backup & sharing', '.backup-body'],
    ['Help', '.help-measure'],
  ])('keeps %s in a reading column', (panel, selector) => {
    renderApp()
    openMenu()
    click(nav(panel))

    const measure = $(selector)
    expect(measure, `${panel} has no column`).not.toBeNull()
    const css = stylesheet()
    const rule = css.slice(css.indexOf(`${selector} {`))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/max-width:\s*68ch/)
  })
})

describe('accessibility', () => {
  it('puts every phrase cell in the tab order as a button', () => {
    renderApp()
    const sample = cells().slice(0, 50)
    expect(sample.every(c => c.getAttribute('role') === 'button')).toBe(true)
    expect(sample.every(c => (c as HTMLElement).tabIndex === 0)).toBe(true)
  })

  it('keeps the toolbar reachable', () => {
    renderApp()
    const buttons = $$<HTMLButtonElement>('.icon-btn')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.filter(b => !b.disabled).every(b => b.tabIndex === 0)).toBe(true)
  })

  it('labels the mode toggles with their pressed state', () => {
    renderApp()
    expect(modes().every(t => t.hasAttribute('aria-pressed'))).toBe(true)
  })
})

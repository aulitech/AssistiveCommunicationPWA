// Getting in: the sign-in page, what it can be worked with before anybody has signed in, and the two documents it links to.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { $$, $, settle, click, mount } from './harness'

describe('sign-in', () => {
  it('shows the sign-in page when nobody is signed in', () => {
    mount()
    expect($('.signin-page')).not.toBeNull()
    expect($('.app')).toBeNull()
  })

  it('names the app', () => {
    mount()
    expect($('.signin-app-name')?.textContent).toBe('Peri')
  })

  it('lets a guest through to the app', () => {
    mount()
    const guest = $$('.auth-btn').find(b => b.getAttribute('aria-label') === 'Continue as guest')
    click(guest)
    expect($('.app')).not.toBeNull()
  })

  // Anyone who needs a slow dwell has to be able to set one before signing in.
  it('offers a dwell-time control before sign-in', () => {
    mount()
    expect($('.signin-dwell')).not.toBeNull()
  })
})

describe('reaching the whole sign-in page', () => {
  const pane = () => $('.signin-page .scroll-pane-inner')!
  const arrows = () => $$('.pane-scroll-btn').map(b => b.getAttribute('aria-label'))
  /** The ones that answer: an arrow with nowhere to go keeps its place, inert. */
  const live = () =>
    $$('.pane-scroll-btn')
      .filter(b => b.getAttribute('aria-disabled') !== 'true')
      .map(b => b.getAttribute('aria-label'))

  /** jsdom lays nothing out, so the overflow the arrows react to is supplied. */
  const setGeometry = (scrollTop: number, clientHeight: number, scrollHeight: number) => {
    const el = pane()
    for (const [prop, value] of Object.entries({ scrollTop, clientHeight, scrollHeight })) {
      Object.defineProperty(el, prop, { value, configurable: true })
    }
    fireEvent.scroll(el)
    settle()
  }

  const showSignIn = () => {
    mount()
    settle()
  }

  it('scrolls its content rather than the page, so the arrows stay put', () => {
    showSignIn()
    expect($('.signin-page > .scroll-pane')).not.toBeNull()
    expect($('.scroll-pane-inner.signin-content')).not.toBeNull()
  })

  // A dwell user has no wheel and no scrollbar. Content past the fold with no
  // arrows is content that cannot be reached at all — including the only way
  // into the app. A jump comes with each nudge: 500 pixels at 80 a time is six
  // dwells, which is a long way to ask somebody to travel.
  /**
   * **A rail on the right, with exactly the useful ones live.** Nothing at all
   * while everything fits, so a short pane keeps its width. Past the fold, all
   * four in the order the grid's rail uses — and the ones with nowhere to go
   * stay in their place answering to nothing, because the four share the rail's
   * height and one that came and went would stretch the rest into its space.
   */
  it('offers dwell controls exactly when there is somewhere to go', () => {
    showSignIn()
    expect(arrows()).toEqual([])
    expect($('.pane-rail'), 'a rail with nothing to scroll').toBeNull()

    const ALL = ['Go to top', 'Scroll up', 'Scroll down', 'Go to bottom']
    setGeometry(0, 400, 900)
    expect(arrows(), 'the rail lost a control rather than keeping it quiet').toEqual(ALL)
    expect(live()).toEqual(['Scroll down', 'Go to bottom'])

    setGeometry(250, 400, 900)
    expect(live()).toEqual(ALL)

    setGeometry(500, 400, 900)
    expect(arrows()).toEqual(ALL)
    expect(live()).toEqual(['Go to top', 'Scroll up'])
  })

  // The right-hand edge, which is where the grid's rail has always been: one
  // edge to go to for everything that scrolls. The layout itself is jsdom's to
  // ignore, so what is asserted is what puts it there.
  it('puts the controls on the right of what they scroll', () => {
    showSignIn()
    setGeometry(0, 400, 900)
    const scroller = $('.signin-page > .scroll-pane')!
    expect(scroller.lastElementChild?.className, 'the rail is not after the content').toBe('pane-rail')
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const rule = css.slice(css.indexOf('.scroll-pane {'))
    expect(rule.slice(0, rule.indexOf('}')), 'the pane stacks its controls again').not.toMatch(
      /flex-direction: *column/,
    )
  })

  // Holding a nudge keeps scrolling; a jump has nowhere further to go, so it
  // fires once however long the pointer stays.
  it('repeats the nudges while held, and not the jumps', () => {
    showSignIn()
    setGeometry(250, 400, 900)

    const scrollBy = vi.fn()
    const scrollTo = vi.fn()
    pane().scrollBy = scrollBy
    pane().scrollTo = scrollTo
    const control = (label: string) => $$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === label)!

    for (const nudge of ['Scroll up', 'Scroll down']) {
      scrollBy.mockClear()
      fireEvent.pointerEnter(control(nudge))
      act(() => void vi.advanceTimersByTime(800 + DEFAULT_SETTINGS.repeatDelayMs * 3))
      fireEvent.pointerLeave(control(nudge))
      settle()
      expect(scrollBy.mock.calls.length, `${nudge} did not repeat`).toBeGreaterThan(2)
    }

    fireEvent.pointerEnter(control('Go to bottom'))
    act(() => void vi.advanceTimersByTime(800 + DEFAULT_SETTINGS.repeatDelayMs * 3))
    fireEvent.pointerLeave(control('Go to bottom'))
    settle()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('jumps the whole way when a jump is dwelled', () => {
    showSignIn()
    setGeometry(250, 400, 900)

    const scrollTo = vi.fn()
    pane().scrollTo = scrollTo
    click($$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === 'Go to top'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    click($$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === 'Go to bottom'))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'smooth' })
  })

  it('scrolls the content when one is dwelled', () => {
    showSignIn()
    setGeometry(0, 400, 900)

    const scrollBy = vi.fn()
    pane().scrollBy = scrollBy
    click($$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === 'Scroll down'))

    expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'smooth' })
  })
})

describe('sign-in providers', () => {
  // Tests run with no VITE_… variables set, so no provider is configured.
  it('offers only guest when nothing is configured', () => {
    mount()
    const labels = $$('.auth-btn').map(b => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Continue as guest'])
  })

  it('hides the divider when there is nothing to divide', () => {
    mount()
    expect($('.signin-divider')).toBeNull()
  })

  it('still lets a guest in', () => {
    mount()
    click($$('.auth-btn').find(b => b.getAttribute('aria-label') === 'Continue as guest'))
    expect($('.app')).not.toBeNull()
  })
})

describe('legal pages', () => {
  const at = (path: string) => {
    window.history.replaceState({}, '', path)
    mount()
    settle()
  }

  afterEach(() => window.history.replaceState({}, '', '/'))

  it.each([
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
  ])('serves %s as a standalone document', (path, title) => {
    at(path)
    expect($('.legal-page')).not.toBeNull()
    expect($('.legal-title')?.textContent).toBe(title)
    expect($('.legal-updated')?.textContent).toMatch(/last updated/i)
    expect($$('.help-section').length).toBeGreaterThan(4)
  })

  // Google and Meta fetch these URLs, and a visitor may have no account.
  it('renders without an account and without the app around it', () => {
    localStorage.clear()
    at('/privacy')
    expect($('.signin-page')).toBeNull()
    expect($('.app')).toBeNull()
    expect($('.legal-page')).not.toBeNull()
  })

  /**
   * **A way back that a dwell can take.** It was a plain anchor, which answers
   * to a click — the one input a gaze user does not have — so somebody who
   * reached the policy by dwell from the guide could read it and not leave it.
   */
  it('offers a way back to the app that answers to a dwell', () => {
    at('/terms')
    const back = $<HTMLAnchorElement>('.legal-back a')!
    expect(back.getAttribute('href')).toBe('/')

    fireEvent.pointerEnter(back)
    expect(back.className, 'resting on the way back starts nothing').toMatch(/dwelling/)
  })

  // A document that scrolled by wheel alone was a document read as far as the
  // first screen and no further.
  it('scrolls by dwell, like every other long thing here', () => {
    at('/privacy')
    expect($('.legal-page .scroll-pane .legal-body'), 'the document is not in a dwell pane').not.toBeNull()
  })

  it('leaves other paths on the app', () => {
    at('/')
    expect($('.legal-page')).toBeNull()
  })

  it('links both documents from the sign-in page', () => {
    at('/')
    const hrefs = $$<HTMLAnchorElement>('.signin-legal a').map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(['/terms', '/privacy'])
  })
})

// Getting in: the sign-in page, what it can be worked with before anybody has signed in, and the two documents it links to.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, act } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { $$, $, settle, click, mount } from './harness'
import { stylesheet } from '../stylesheet'

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
  /** The floating arrows there to be used: one with nowhere to go is hidden. */
  const arrows = () => $$('.pane-arrow:not(.is-hidden)').map(b => b.getAttribute('aria-label'))
  const arrow = (label: string) => $$('.pane-arrow').find(b => b.getAttribute('aria-label') === label)!
  /**
   * After the scroll that set the geometry, and the choice before: a page waits
   * until the pane has stopped moving, and the pause after choosing.
   */
  const still = () => act(() => void vi.advanceTimersByTime(1100))

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
  // into the app.
  /**
   * **The floating arrows every surface that scrolls has**, each only while
   * there is somewhere to go that way. It was a rail of four, a nudge and an
   * end each way, the ones with nowhere to go kept in place and inert.
   */
  it('offers an arrow exactly where there is somewhere to go', () => {
    showSignIn()
    expect(arrows()).toEqual([])

    setGeometry(0, 400, 900)
    expect(arrows()).toEqual(['Scroll down'])

    setGeometry(250, 400, 900)
    expect(arrows()).toEqual(['Scroll up', 'Scroll down'])

    setGeometry(500, 400, 900)
    expect(arrows()).toEqual(['Scroll up'])
  })

  // Floating over the pane's right edge, as over the grid's: the pane is what
  // they stand against, and they are its own, not a column beside it.
  it('floats the arrows over the right edge of what they scroll', () => {
    showSignIn()
    setGeometry(0, 400, 900)
    const scroller = $('.signin-page > .scroll-pane')!
    expect(arrow('Scroll down').parentElement).toBe(scroller)
    const css = stylesheet()
    const rule = css.slice(css.indexOf('.scroll-pane {'))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/position: *relative/)
    const arrowRule = css.slice(css.search(/^\.scroll-arrow \{/m))
    expect(arrowRule.slice(0, arrowRule.indexOf('}'))).toMatch(/position: *absolute;[\s\S]*right: *10px/)
  })

  // **A page goes on while the pointer stays** — after a rest, and after a
  // click: an operating system's dwell-click is a click, and the arrows paged
  // once for a gaze that went on resting on them.
  it('repeats a page while rested on, and while clicked and stayed on', () => {
    showSignIn()
    setGeometry(250, 400, 900)
    still()
    const scrollTo = vi.fn()
    pane().scrollTo = scrollTo

    fireEvent.pointerEnter(arrow('Scroll down'))
    act(() => void vi.advanceTimersByTime(800 + DEFAULT_SETTINGS.repeatDelayMs * 3))
    fireEvent.pointerLeave(arrow('Scroll down'))
    settle()
    expect(scrollTo.mock.calls.length, 'a rest did not repeat').toBeGreaterThan(2)

    scrollTo.mockClear()
    still()
    fireEvent.click(arrow('Scroll up'))
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.repeatDelayMs * 3 + 100))
    expect(scrollTo.mock.calls.length, 'a click did not repeat').toBeGreaterThan(2)
    fireEvent.pointerLeave(arrow('Scroll up'))
    settle()
    const stopped = scrollTo.mock.calls.length
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.repeatDelayMs * 3))
    expect(scrollTo.mock.calls.length, 'it went on once the pointer left').toBe(stopped)
  })

  // Five sixths of what shows, so a sixth of it is still in sight to read on
  // from — and never past the end.
  it('scrolls the content a page at a time, never past the end', () => {
    showSignIn()
    setGeometry(0, 400, 900)
    still()
    const scrollTo = vi.fn()
    pane().scrollTo = scrollTo
    click(arrow('Scroll down'))
    expect(scrollTo).toHaveBeenCalledWith({ top: expect.closeTo((400 * 5) / 6), behavior: 'smooth' })

    setGeometry(400, 400, 900)
    still()
    click(arrow('Scroll down'))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 500, behavior: 'smooth' })
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

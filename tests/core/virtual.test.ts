import { describe, it, expect } from 'vitest'
import { needsMore, windowSize } from '../../src/core/virtual'

// The arithmetic behind how much of the grid is rendered. The wiring is tested
// through the DOM in App.test.tsx; this is the part that decides the numbers.

const viewport = (clientHeight: number, scrollTop = 0, scrollHeight = clientHeight) => ({
  clientHeight,
  scrollTop,
  scrollHeight,
})

describe('how much to render', () => {
  it('covers several screens, so scrolling has somewhere to go', () => {
    // 800px of viewport at 72px rows is 12 rows; four screens of those, 5 across.
    expect(windowSize(viewport(800), { columns: 5, rowHeight: 72 })).toBe(12 * 4 * 5)
  })

  it('scales with the viewport and the number of columns', () => {
    const tall = windowSize(viewport(1600), { columns: 5, rowHeight: 72 })!
    const short = windowSize(viewport(800), { columns: 5, rowHeight: 72 })!
    // Rows are rounded up, so twice the height is nearly rather than exactly
    // twice the cells.
    expect(tall).toBeGreaterThan(short * 1.8)
    expect(tall).toBeLessThanOrEqual(short * 2)

    const narrow = windowSize(viewport(800), { columns: 3, rowHeight: 72 })!
    expect(narrow).toBeLessThan(short)
  })

  // The whole safety property. Nothing has been laid out before the first paint,
  // and nothing is ever laid out under jsdom — in both cases the honest answer
  // is "all of them", which is what the grid did before any of this existed.
  it.each([
    ['no viewport', viewport(0), { columns: 5, rowHeight: 72 }],
    ['no row height', viewport(800), { columns: 5, rowHeight: 0 }],
    ['no columns', viewport(800), { columns: 0, rowHeight: 72 }],
  ])('renders everything when there is %s to measure', (_case, v, m) => {
    expect(windowSize(v, m)).toBeNull()
  })

  it('never renders less than one row', () => {
    expect(windowSize(viewport(1), { columns: 5, rowHeight: 72 })).toBeGreaterThanOrEqual(5)
  })
})

describe('when to render more', () => {
  it('stops once everything is rendered', () => {
    expect(needsMore(viewport(800, 0, 4000), 500, 500)).toBe(false)
    expect(needsMore(viewport(800, 3200, 4000), 500, 500)).toBe(false)
  })

  it('waits while the end is far away', () => {
    expect(needsMore(viewport(800, 0, 4000), 200, 500)).toBe(false)
  })

  it('asks for more within a screen of the end', () => {
    expect(needsMore(viewport(800, 2400, 4000), 200, 500)).toBe(true)
  })

  // The self-correcting part: a window too small to fill the screen leaves the
  // grid unscrollable, and an unscrollable grid can never ask for more by
  // scrolling. So not filling the screen is itself the signal.
  it('asks for more whenever the cells do not fill the viewport', () => {
    expect(needsMore(viewport(800, 0, 300), 20, 500)).toBe(true)
    expect(needsMore(viewport(800, 0, 800), 20, 500)).toBe(true)
  })

  it('still stops when they do not fill it but there is nothing left', () => {
    expect(needsMore(viewport(800, 0, 300), 500, 500)).toBe(false)
  })
})

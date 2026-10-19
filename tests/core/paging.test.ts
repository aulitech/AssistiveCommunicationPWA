// Where a page of the grid lands — the arithmetic behind the two arrows over
// it. Rows here are not one height, so these are given as where each starts.

import { describe, it, expect } from 'vitest'
import { pageTarget } from '../../src/core/paging'

/** Where each row starts, from how tall each is. */
const rows = (...heights: number[]) => heights.map((_, i) => heights.slice(0, i).reduce((a, b) => a + b, 0))

describe('a page of the grid', () => {
  const even = Array.from({ length: 30 }, (_, i) => i * 80)

  it('goes five sixths of the view, back to the top of the row there', () => {
    // 600 shows; five sixths is 500; the last row starting by then is at 480.
    expect(pageTarget(0, 600, even, 1)).toBe(480)
    expect(pageTarget(480, 600, even, 1)).toBe(960)
  })

  it('comes back the same way, to the top of the nearest row at or below the mark', () => {
    // 960 less 500 is 460; the first row starting there or after is at 480.
    expect(pageTarget(960, 600, even, -1)).toBe(480)
  })

  it('keeps a sixth or more of the view it left in sight', () => {
    for (const from of [0, 160, 400, 880]) {
      const to = pageTarget(from, 600, even, 1)
      expect(to - from, `from ${from}`).toBeLessThanOrEqual(500)
      expect(to - from, `from ${from}`).toBeGreaterThan(0)
    }
  })

  it('lands on rows of every height', () => {
    const tops = rows(80, 200, 80, 160, 80, 80, 300, 80)
    // 0, 80, 280, 360, 520, 600, 680, 980 — five sixths of 600 is 500, and 360 is the last there.
    expect(pageTarget(0, 600, tops, 1)).toBe(360)
  })

  // A row taller than the page would never be passed: it moves the page and
  // lets that one row be split, rather than not moving at all.
  it('moves the page anyway past a row taller than it', () => {
    expect(pageTarget(0, 600, [0, 900, 980], 1)).toBe(500)
    expect(pageTarget(900, 600, [0, 900, 980], -1)).toBe(400)
  })

  it('goes no higher than the top', () => {
    expect(pageTarget(200, 600, even, -1)).toBe(0)
    expect(pageTarget(100, 600, [], -1)).toBe(0)
  })
})

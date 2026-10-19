import { describe, expect, it } from 'vitest'
import { tabsThatFit } from '../../src/core/tab-rows'

// Tabs of 100 in a room of 320 sit three to the row: 100 + 6 + 100 + 6 + 100.
const tabs = (n: number) => Array.from({ length: n }, () => 100)
const more = () => 100

describe('how many tabs fit on one row', () => {
  it('is all of them where all of them fit', () => {
    expect(tabsThatFit(tabs(3), 320, more)).toBe(3)
  })

  // Two and More make the three a row holds.
  it('leaves room for More after the last that fits', () => {
    expect(tabsThatFit(tabs(4), 320, more)).toBe(2)
  })

  // More with the name of a tab it hides in it is wider, and takes a tab's room.
  it('gives More the room the name of the tab it hides takes', () => {
    expect(tabsThatFit(tabs(4), 320, () => 200)).toBe(1)
  })

  // The tab showing is the first: shown, More says only "More", and is narrow.
  it('gives More only its own room where the tab showing is among those shown', () => {
    expect(tabsThatFit(tabs(4), 320, k => (k < 1 ? 200 : 100))).toBe(2)
  })

  it('shows everything where nothing has been measured', () => {
    expect(tabsThatFit(tabs(30), 0, more)).toBe(30)
  })

  // Something is off the bar, so More is there however few tabs are left on it
  // — and its room is kept, even where those would all fit without it.
  it("keeps More's room while anything is hidden, whatever fits", () => {
    expect(tabsThatFit(tabs(2), 320, more, true)).toBe(2)
    expect(tabsThatFit(tabs(3), 320, more, true)).toBe(2)
    expect(tabsThatFit(tabs(3), 320, more)).toBe(3)
  })
})

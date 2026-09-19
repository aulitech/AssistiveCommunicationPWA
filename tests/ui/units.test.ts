import { describe, it, expect } from 'vitest'
import { seconds } from '../../src/ui/units'

// Every time a person sets here is written in seconds, with three figures after
// the point or none — never one or two. Three because the auto-repeat steps in
// fifty milliseconds, and one figure would write its 1050 as 1.1s, a value that
// spinner cannot hold; none on a whole second, where `.000` says nothing.
describe('a time, written for somebody to read', () => {
  it.each([
    [1000, '1s'],
    [2000, '2s'],
    [3000, '3s'],
  ])('writes %i ms as a whole number of seconds', (ms, said) => {
    expect(seconds(ms)).toBe(said)
  })

  it.each([
    [1500, '1.500s'],
    [800, '0.800s'],
    [1050, '1.050s'],
    [300, '0.300s'],
    [50, '0.050s'],
  ])('writes %i ms with three figures after the point', (ms, said) => {
    expect(seconds(ms)).toBe(said)
  })

  // The rule stated as a property, over every value any spinner here can reach.
  it('never writes one or two figures after the point', () => {
    for (let ms = 50; ms <= 3000; ms += 50) {
      const after = seconds(ms).replace(/s$/, '').split('.')[1] ?? ''
      expect([0, 3], `${ms} ms written as ${seconds(ms)}`).toContain(after.length)
    }
  })
})

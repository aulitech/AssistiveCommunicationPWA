import { describe, it, expect } from 'vitest'
import { refusal, type Candidate } from '../../tools/promote'

// What `pnpm promote` will and will not move main to. Everything that reaches
// the people using Peri passes through here, so each refusal is a test.
const ready: Candidate = {
  same: false,
  mainIsBehind: true,
  subject: 'Version 10.3.0',
  checks: { check: 'success', browser: 'success', 'version label': null },
}

describe('refusal', () => {
  it('moves main to a release preview has passed', () => {
    expect(refusal(ready)).toBeNull()
  })

  it('publishes again where main is already at preview', () => {
    expect(refusal({ ...ready, same: true, mainIsBehind: false })).toBeNull()
  })

  // Moving main would throw away commits only main has.
  it('refuses a main that is not behind preview', () => {
    expect(refusal({ ...ready, mainIsBehind: false })).toMatch(/main has commits preview does not/)
  })

  it('refuses a preview that does not end in a release', () => {
    expect(refusal({ ...ready, subject: 'Something not yet cut' })).toMatch(/not a release/)
  })

  it('refuses a release whose suite failed, or has not finished', () => {
    expect(refusal({ ...ready, checks: { ...ready.checks, check: 'failure' } })).toMatch(/check check is failure/)
    expect(refusal({ ...ready, checks: { ...ready.checks, check: null } })).toMatch(/not reported yet/)
  })

  // Not required to merge into preview, but nothing goes out that fails it.
  it('refuses a release whose browser tests failed, or never ran', () => {
    expect(refusal({ ...ready, checks: { check: 'success', browser: 'failure' } })).toMatch(
      /browser check is failure/,
    )
    expect(refusal({ ...ready, checks: { check: 'success' } })).toMatch(/browser check is not reported yet/)
  })
})

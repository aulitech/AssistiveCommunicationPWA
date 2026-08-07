import { describe, it, expect } from 'vitest'
import { PRIVACY, TERMS, legalDocumentFor } from './legal'

const allText = (doc: typeof PRIVACY) => [
  doc.intro ?? '',
  ...doc.sections.flatMap(s => s.blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.items))),
]

describe('routing', () => {
  it.each([
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
    ['/privacy/', 'Privacy Policy'],
    ['/PRIVACY', 'Privacy Policy'],
  ])('%s serves %s', (path, title) => {
    expect(legalDocumentFor(path)?.title).toBe(title)
  })

  it.each(['/', '/help', '/privacy-policy', ''])('%s is not a legal page', path => {
    expect(legalDocumentFor(path)).toBeNull()
  })
})

describe('both documents', () => {
  it.each([
    ['privacy', PRIVACY],
    ['terms', TERMS],
  ])('%s is complete', (_name, doc) => {
    expect(doc.title.trim()).not.toBe('')
    expect(doc.updated.trim()).not.toBe('')
    expect(doc.sections.length).toBeGreaterThan(4)
    for (const section of doc.sections) {
      expect(section.title.trim(), 'every section needs a title').not.toBe('')
      expect(section.blocks.length, `"${section.title}" is empty`).toBeGreaterThan(0)
    }
    for (const line of allText(doc)) expect(line.trim()).not.toBe('')
  })

  it.each([
    ['privacy', PRIVACY],
    ['terms', TERMS],
  ])('%s says how to get in touch', (_name, doc) => {
    expect(allText(doc).some(l => l.includes('@'))).toBe(true)
  })
})

describe('the privacy policy', () => {
  const lines = allText(PRIVACY)
  const says = (pattern: RegExp) => lines.some(l => pattern.test(l))

  // These claims are the whole point of the document. If the app ever starts
  // collecting anything, these tests should be what forces the policy to change.
  it('states that nothing is collected', () => {
    expect(says(/no servers|operate no servers|Nothing\./i)).toBe(true)
  })

  it('states that data stays on the device', () => {
    expect(says(/never leaves your device|stored in your browser/i)).toBe(true)
  })

  it('covers sign-in, and that it is optional', () => {
    expect(says(/signing in .*optional|optional — the app works fully as a guest/i)).toBe(true)
  })

  it('discloses that cloud voices may send text off the device', () => {
    // Easy to omit, and untrue to leave out — some OS voices are server-side.
    expect(says(/cloud|servers/i)).toBe(true)
  })

  it('names the host, since their logs are outside our control', () => {
    expect(says(/Netlify/)).toBe(true)
  })

  it('explains how to delete everything', () => {
    expect(says(/clearing this site|uninstalling/i)).toBe(true)
  })

  it('states there is no tracking or analytics', () => {
    expect(says(/no tracking|no analytics|advertising or analytics/i)).toBe(true)
  })
})

describe('the terms', () => {
  const lines = allText(TERMS)
  const says = (pattern: RegExp) => lines.some(l => pattern.test(l))

  // The app has a "Call 911" button that only speaks aloud. Someone must not
  // be left believing it summons help.
  it('says plainly that it is not a medical device', () => {
    expect(says(/not a medical device/i)).toBe(true)
  })

  it('says the emergency phrases do not contact anyone', () => {
    expect(says(/do not call anyone|do not call|not reach any emergency service/i)).toBe(true)
  })

  it('tells people to keep another way of summoning help', () => {
    expect(says(/separate, non-digital means|only way to summon help/i)).toBe(true)
  })

  it('puts the emergency warning first, where it will be read', () => {
    expect(TERMS.sections[0].title).toMatch(/emergency|medical device/i)
  })

  it('disclaims warranty and limits liability', () => {
    expect(says(/without warranty/i)).toBe(true)
    expect(says(/not liable/i)).toBe(true)
  })

  it('mentions the licence the app is published under', () => {
    expect(says(/MIT Licence|MIT License/i)).toBe(true)
  })
})

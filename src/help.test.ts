import { describe, it, expect } from 'vitest'
import { HELP_SECTIONS } from './help'

const allText = HELP_SECTIONS.flatMap(s =>
  s.blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.items)),
)

describe('the user guide', () => {
  it('has sections, each with content', () => {
    expect(HELP_SECTIONS.length).toBeGreaterThan(5)
    for (const section of HELP_SECTIONS) {
      expect(section.title.trim(), 'every section needs a title').not.toBe('')
      expect(section.blocks.length, `"${section.title}" has no content`).toBeGreaterThan(0)
    }
  })

  it('has no empty paragraphs or list items', () => {
    for (const line of allText) expect(line.trim()).not.toBe('')
    for (const section of HELP_SECTIONS) {
      for (const block of section.blocks) {
        if (block.kind === 'list') expect(block.items.length).toBeGreaterThan(0)
      }
    }
  })

  // The app was called DwellSpeak. Prose is where a rename leaves survivors.
  it('calls the app Peri throughout', () => {
    expect(allText.some(l => l.includes('Peri'))).toBe(true)
    expect(allText.filter(l => /dwellspeak/i.test(l))).toEqual([])
  })

  it('uses unique section titles, so nothing is duplicated or lost', () => {
    const titles = HELP_SECTIONS.map(s => s.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  // The guide is the one place the app explains itself. If a feature ships
  // without a mention here, the guide is quietly wrong.
  it.each([
    ['dwell selection', /rest(ing)? on|hold it still/i],
    ['the message box', /message/i],
    ['phrases with choices', /choos/i],
    ['auto-speak', /auto-speak/i],
    ['emergency phrases', /emergency/i],
    ['edit mode', /edit mode/i],
    ['contacts and name', /contact/i],
    ['dwell time settings', /dwell/i],
    ['keyboard access', /keyboard|Tab key/i],
    ['offline use', /offline|no internet/i],
    ['backup and import', /backup/i],
  ])('covers %s', (_feature, pattern) => {
    expect(allText.some(line => pattern.test(line))).toBe(true)
  })

  it('states plainly that nothing is uploaded', () => {
    // The sign-in page makes this promise; the guide must not contradict it.
    expect(allText.some(l => /nothing is uploaded/i.test(l))).toBe(true)
  })

  it('keeps sentences short enough to read while tired', () => {
    const tooLong = allText.filter(line => line.length > 320)
    expect(tooLong).toEqual([])
  })
})

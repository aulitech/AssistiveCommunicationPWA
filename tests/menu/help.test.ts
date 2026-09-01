import { describe, it, expect } from 'vitest'
import { HELP_SECTIONS } from '../../src/menu/help'

const allText = HELP_SECTIONS.flatMap(s => s.blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.items)))

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
    ['linked voices', /ElevenLabs/],
    ['the sent list', /Sent tab/],
    ['texting acronyms', /Texting category/],
    ['a voice per phrase', /Voice setting/],
    ['the paste button, and what to do when it is refused', /paste button/i],
    ['clipboard access having to be allowed', /allow clipboard access/i],
    ['the choice syntax, for whoever writes the phrases', /\{'red', 'blue'\}/],
    ['an empty pair leaving a blank', /\{\} ?—|brackets with nothing in them/i],
    ['the lists Peri knows itself', /\{pronouns\}/],
    ['bold and italic', /\*\*two stars\*\*/],
    ['a line through', /~~two tildes~~/],
    ['headings and bullets in a phrase', /at the start of a line/i],
    ['formatting being seen and not heard', /spoken and searched exactly as they read/i],
  ])('covers %s', (_feature, pattern) => {
    expect(allText.some(line => pattern.test(line))).toBe(true)
  })

  // Somebody opening the guide is usually looking for one thing. The first
  // section says what the screen is made of, so they know which heading to open.
  it('opens with an overview of the whole screen', () => {
    expect(HELP_SECTIONS[0].title).toBe('Overview')
    const overview = HELP_SECTIONS[0].blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.items))
    for (const part of [/message/i, /Rest/, /categor/i, /red bar/i]) {
      expect(
        overview.some(l => part.test(l)),
        `the overview does not mention ${part}`,
      ).toBe(true)
    }
  })

  // Both moved to the strip across the top of the message box; the guide said
  // "the right-hand column" for a while after they left it.
  it('does not send anyone to the rail for the edit or auto-speak buttons', () => {
    expect(allText.filter(l => /right-hand column/i.test(l))).toEqual([])
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

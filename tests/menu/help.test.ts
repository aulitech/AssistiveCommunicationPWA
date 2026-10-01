import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { HELP_SECTIONS } from '../../src/menu/help'
import { PRIVACY } from '../../src/legal/legal'

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
    ['what is said being kept', /Every message you speak or copy is kept in Library/],
    ['texting acronyms', /texting acronyms stand for/],
    ['every phrase being in Library', /Every phrase is in Library, each one once/],
    ['categories holding phrases from Library', /categories you make hold phrases from Library/],
    ['a voice per phrase', /voice it is said in/i],
    ['what to do when a paste is refused', /allow clipboard access/i],
    ['clipboard access having to be allowed', /allow clipboard access/i],
    ['the choice syntax, for whoever writes the phrases', /\{'red', 'blue'\}/],
    ['an empty pair leaving a blank', /\{\} ?—|brackets with nothing in them/i],
    ['the lists Peri knows itself', /\{pronouns\}/],
    ['bold and italic', /\*\*two stars\*\*/],
    ['a line through', /~~two tildes~~/],
    ['headings and bullets in a phrase', /at the start of a line/i],
    ['formatting being seen and not heard', /spoken and searched exactly as they read/i],
    ['the board as a spreadsheet', /Save for Excel/],
    ['bringing a spreadsheet back', /Paste from Sheets/],
    ['the word lists in a spreadsheet', /one word to a row/],
    ['resting', /switches dwelling off everywhere but on itself/],
    ['paging the grid and the tabs', /:page-up: and :page-down: a page/],
    ['putting a deleted phrase back', /After a delete/],
    ['arranging the category tabs', /rearranges the tabs/],
    ['what uses the internet', /A few things use the internet/],
  ])('covers %s', (_feature, pattern) => {
    expect(allText.some(line => pattern.test(line))).toBe(true)
  })

  // Somebody opening the guide is usually looking for one thing. The first
  // section says what the screen is made of, so they know which heading to open.
  it('opens with an overview of the whole screen', () => {
    expect(HELP_SECTIONS[0].title).toBe('Overview')
    const overview = HELP_SECTIONS[0].blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.items))
    for (const part of [/message/i, /Rest/, /categor/i, /blue bar/i]) {
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

  /**
   * **Every row in Settings is in the guide's Settings section**, read out of
   * the panel itself. The guide listed six of the fourteen once — the rows added
   * since had never been written into it, and nothing said so.
   */
  it('names every row in Settings', () => {
    const panel = readFileSync('src/menu/settings-panel.tsx', 'utf8')
    const rows = [
      ...[...panel.matchAll(/<SettingRow\s+label="([^"]+)"/g)].map(m => m[1]),
      ...[...panel.matchAll(/className="setting-label">([^<]+)</g)].map(m => m[1]),
      ...[...panel.matchAll(/label="(Reset to Factory Defaults)"/g)].map(m => m[1]),
    ]
    expect(rows.length).toBeGreaterThan(10)
    const quotes = (t: string) => t.replace(/[‘’]/g, "'")
    const settings = HELP_SECTIONS.find(s => s.title === 'Settings')!
    const said = quotes(settings.blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.items)).join('\n'))
    expect(rows.filter(row => !said.includes(quotes(row)))).toEqual([])
  })

  // The same for the menu: every item in it is in the Overview's line about the
  // menu, with its icon, read out of the menu itself — so an item added there
  // fails here until the guide says it exists.
  it('names every item in the menu, with its icon, in the overview', () => {
    const menu = readFileSync('src/menu/menu.tsx', 'utf8')
    const items = [...menu.matchAll(/<NavItem[\s\S]*?label="([^"]+)"/g)].map(m => m[1])
    expect(items.length).toBeGreaterThan(4)
    const overview = HELP_SECTIONS.find(s => s.title === 'Overview')!
    const said = overview.blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.items)).join('\n')
    expect(items.filter(item => !new RegExp(`:[a-z-]+: ${item.replace(/[&]/g, '\\$&')}`).test(said))).toEqual([])
  })

  // **Two claims that were true once and stopped being.** The emergency bar
  // plays an ElevenLabs clip already loaded — `speak`'s `instant` rules out
  // fetching, not the voice — and listen mode uses the microphone. Both were
  // said the other way round, the second in the privacy policy, until 7.6.1.
  it('does not say the emergency bar always uses the device voice, or that the microphone is never used', () => {
    const settingsRows = readFileSync('src/menu/settings-panel.tsx', 'utf8')
    const policy = [
      ...(PRIVACY.intro ? [PRIVACY.intro] : []),
      ...PRIVACY.sections.flatMap(s => s.blocks.flatMap(b => (b.kind === 'text' ? [b.text] : b.items))),
    ]
    for (const [where, text] of [
      ['the guide', allText.join(' ')],
      ['the Settings rows', settingsRows],
      ['the privacy policy', policy.join(' ')],
    ] as const) {
      expect(text, where).not.toMatch(/emergency bar always uses/i)
      expect(text, where).not.toMatch(/no access to your microphone/i)
    }
  })

  // Every control on the message box's borders is one size now; Speak is told
  // apart by being last and green.
  it('does not call Speak the biggest button', () => {
    expect(allText.filter(l => /largest thing on the bar|biggest button/i.test(l))).toEqual([])
  })

  it('keeps sentences short enough to read while tired', () => {
    const tooLong = allText.filter(line => line.length > 320)
    expect(tooLong).toEqual([])
  })
})

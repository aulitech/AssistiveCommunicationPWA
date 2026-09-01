import { describe, it, expect } from 'vitest'
import { inGroup, speechLanguages, voiceGroups, voiceLabel, type VoiceChoice } from '../../src/voice/groups'

// Cutting a long list down. Device voices divide by language, an account's
// voices by the collection it files them under, and a voice belongs to one or
// the other — never both.

const device = (name: string, lang: string): VoiceChoice => ({ voiceURI: `uri-${name}`, name, lang })
const remote = (name: string, collection?: string): VoiceChoice => ({
  voiceURI: `elevenlabs:${name}`,
  name,
  remote: true,
  collection,
})

const ITEMS = [
  remote('Rachel', 'premade'),
  remote('Adam', 'premade'),
  remote('Me', 'cloned'),
  device('Daniel', 'en-GB'),
  device('Karen', 'en-AU'),
  device('Moira', 'en-GB'),
]

describe('grouping the voices', () => {
  it('offers a group per collection and per language, with counts', () => {
    expect(voiceGroups(ITEMS).map(g => [g.id, g.count])).toEqual([
      ['collection:cloned', 1],
      ['collection:premade', 2],
      ['lang:en-AU', 1],
      ['lang:en-GB', 2],
    ])
  })

  // The exact wording comes from the browser's own language data and is
  // localised, so what is checked is that it is words rather than a code.
  it('names a language readably rather than as a tag', () => {
    const [group] = voiceGroups([device('Daniel', 'en-GB')])
    expect(group.label).not.toBe('en-GB')
    expect(group.label).toMatch(/english/i)
  })

  it('titles a collection rather than shouting its raw value', () => {
    expect(voiceGroups([remote('Rachel', 'premade')])[0].label).toBe('Premade')
  })

  // Somebody who linked an account is looking for those voices, not scrolling
  // past sixty the browser came with.
  it('puts the collections before the languages', () => {
    const ids = voiceGroups(ITEMS).map(g => g.id)
    expect(ids.filter(id => id.startsWith('collection:'))).toEqual(ids.slice(0, 2))
  })

  it('files an account voice with no collection under one of its own', () => {
    expect(voiceGroups([remote('Nameless')]).map(g => g.label)).toEqual(['Other'])
  })

  it('ignores a device voice with no language, having nothing to group it by', () => {
    expect(voiceGroups([{ voiceURI: '', name: 'Default' }])).toEqual([])
  })

  it('offers nothing to filter by when there is only one group', () => {
    expect(voiceGroups([device('Daniel', 'en-GB'), device('Moira', 'en-GB')])).toHaveLength(1)
  })
})

describe('what a group contains', () => {
  const only = (group: string | null) => ITEMS.filter(v => inGroup(v, group)).map(v => v.name)

  it('is everything when nothing is chosen', () => {
    expect(only(null)).toHaveLength(ITEMS.length)
  })

  it('is the account voices in that collection', () => {
    expect(only('collection:premade')).toEqual(['Rachel', 'Adam'])
    expect(only('collection:cloned')).toEqual(['Me'])
  })

  it('is the device voices in that language', () => {
    expect(only('lang:en-GB')).toEqual(['Daniel', 'Moira'])
  })

  // The two kinds never answer to each other's groups, which is what lets one
  // row of chips serve both. Neither guard shows up unless the fixture has the
  // awkward cases: an account voice that also carries a language, and a device
  // voice that would otherwise fall into the collection for voices with none.
  it('never mixes the two kinds', () => {
    const awkward: VoiceChoice[] = [
      { voiceURI: 'elevenlabs:a', name: 'Rachel', remote: true, collection: 'premade', lang: 'en-GB' },
      { voiceURI: 'elevenlabs:b', name: 'Nameless', remote: true },
      device('Daniel', 'en-GB'),
    ]
    const inside = (group: string) => awkward.filter(v => inGroup(v, group)).map(v => v.name)

    expect(inside('lang:en-GB'), 'an account voice answered to a language').toEqual(['Daniel'])
    expect(inside('collection:other'), 'a device voice answered to a collection').toEqual(['Nameless'])
    expect(inside('collection:premade')).toEqual(['Rachel'])
  })
})

describe('naming a voice', () => {
  it('says where an account voice came from', () => {
    expect(voiceLabel(remote('Rachel', 'premade'))).toBe('Rachel · ElevenLabs')
  })

  it('says what language a device voice speaks', () => {
    expect(voiceLabel(device('Daniel', 'en-GB'))).toBe('Daniel · en-GB')
  })

  it('says just the name when there is nothing to add', () => {
    expect(voiceLabel({ voiceURI: '', name: 'Default' })).toBe('Default')
  })
})

/**
 * The languages a device can actually speak.
 *
 * Built from the installed voices rather than from a list of the world's
 * languages: offering one this device has no voice for would be offering
 * silence — the setting would take, and nothing would change.
 */
describe('the languages on offer', () => {
  const voices = [
    { lang: 'en-GB' },
    { lang: 'en-GB' },
    { lang: 'fr-FR' },
    { lang: 'de-DE' },
  ]

  it('offers each language once, with how many voices it has', () => {
    const langs = speechLanguages(voices)
    expect(langs.map(l => l.tag).sort()).toEqual(['de-DE', 'en-GB', 'fr-FR'])
    expect(langs.find(l => l.tag === 'en-GB')?.count).toBe(2)
  })

  it('offers nothing for a device with no voices at all', () => {
    expect(speechLanguages([])).toEqual([])
  })

  it('skips a voice that will not say what language it is', () => {
    expect(speechLanguages([{ lang: '' }, { lang: 'en-US' }]).map(l => l.tag)).toEqual(['en-US'])
  })

  /**
   * The browser's own language leads. It is the likeliest answer, and it saves
   * reading down a list of sixty to find it.
   */
  it("puts the device's own language first", () => {
    const langs = speechLanguages([{ lang: 'zu-ZA' }, { lang: 'en-US' }, { lang: 'af-ZA' }])
    expect(langs[0].tag).toBe('en-US')
  })

  it('names a language rather than showing its code', () => {
    const [only] = speechLanguages([{ lang: 'fr-FR' }])
    expect(only.label).not.toBe('fr-FR')
    expect(only.label.toLowerCase()).toContain('french')
  })
})

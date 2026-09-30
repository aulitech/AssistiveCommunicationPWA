import { describe, it, expect } from 'vitest'
import { prosePieces, sectionPieces } from '../../src/core/prose'
import { PROSE_ICON_NAMES, PROSE_ICONS } from '../../src/ui/prose-icons'

const NAMES: Record<string, string> = { speak: 'Speak', clear: 'Clear', 'auto-speak': 'Auto-speak' }
const nameOf = (icon: string) => NAMES[icon]
/** Which icons in each line are drawn with their names. */
const named = (lines: string[]) =>
  sectionPieces(lines, nameOf).map(line => line.flatMap(p => ('icon' in p && p.named ? [p.icon] : [])))

describe('a line of prose', () => {
  it('is what to read and what to draw', () => {
    expect(prosePieces('Rest on :speak: to say it')).toEqual([
      { word: 'Rest on ' },
      { icon: 'speak' },
      { word: ' to say it' },
    ])
  })
})

/**
 * **The first time a section uses an icon, it is named.** An icon alone asks
 * somebody to know it already, and a section is read on its own.
 */
describe('the icons in a section', () => {
  it('names the first use of each, and only the first', () => {
    expect(named(['Rest on :speak: or :clear:.', 'Then :speak: again, and :clear:.'])).toEqual([
      ['speak', 'clear'],
      [],
    ])
  })

  it('counts from the start of the section, across its paragraphs and lists', () => {
    expect(named(['Nothing here.', ':speak: says it.', 'So does :speak:.'])).toEqual([[], ['speak'], []])
  })

  // `:auto-speak: Auto-speak — …` names itself; a second name would stutter.
  it('takes a first use the words already name as named', () => {
    expect(named([':auto-speak: Auto-speak — a phrase is spoken.', 'Turn :auto-speak: off.'])).toEqual([[], []])
    expect(named([':speak:  speak it.'])).toEqual([[]])
  })

  it('draws an icon with no name alone', () => {
    expect(named(['Rest on :keyboard:.'])).toEqual([[]])
  })

  it('has a name for every icon prose can draw', () => {
    expect(Object.keys(PROSE_ICONS).filter(icon => !PROSE_ICON_NAMES[icon])).toEqual([])
  })
})

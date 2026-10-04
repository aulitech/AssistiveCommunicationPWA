import { describe, it, expect } from 'vitest'
import { PLEASE, withPlease } from '../../src/core/please'

// ", please" on the end of what is said, before whatever ends the sentence, in
// the word for the language the words came out in.
describe('withPlease', () => {
  it('goes on the end of words with nothing after them', () => {
    expect(withPlease('I want water', PLEASE)).toBe('I want water, please')
  })

  it('goes before the mark that ends the sentence', () => {
    expect(withPlease('I want water.', PLEASE)).toBe('I want water, please.')
    expect(withPlease('Can you help me?', PLEASE)).toBe('Can you help me, please?')
    expect(withPlease('Help me!', PLEASE)).toBe('Help me, please!')
  })

  // Spanish opens the sentence as well as closing it, and French puts a space
  // before its exclamation mark — both kept as they were written.
  it('keeps the ending exactly as the language writes it', () => {
    expect(withPlease('¡Ayúdenme!', 'Por favor')).toBe('¡Ayúdenme, por favor!')
    expect(withPlease('Aidez-moi !', "S'il te plaît")).toBe("Aidez-moi, s'il te plaît !")
  })

  it('takes the word mid-sentence, so not capitalised and with no full stop of its own', () => {
    expect(withPlease('Quiero agua', 'Por favor.')).toBe('Quiero agua, por favor')
  })

  it('replaces a comma the words already end on rather than doubling it', () => {
    expect(withPlease('Water,', PLEASE)).toBe('Water, please')
  })

  it('leaves words that already say please, at either end', () => {
    expect(withPlease('Please', PLEASE)).toBe('Please')
    expect(withPlease('Please help me', PLEASE)).toBe('Please help me')
    expect(withPlease('Can you help me, please?', PLEASE)).toBe('Can you help me, please?')
    expect(withPlease('Tengo frío, por favor', 'Por favor')).toBe('Tengo frío, por favor')
  })

  // A word that merely ends in the same letters is not the word.
  it('does not mistake a longer word for it', () => {
    expect(withPlease('That would displease', PLEASE)).toBe('That would displease, please')
  })

  it('leaves words alone when there is nothing to put on them, or nothing to put on', () => {
    expect(withPlease('!', PLEASE)).toBe('!')
    expect(withPlease('Water', '  ')).toBe('Water')
  })
})

import { describe, it, expect } from 'vitest'
import { keepPhrased, typedIn } from '../../src/talk/typed'

// What has been typed, which the grid searches for — the one rule the message
// and the phrase being edited both follow.
describe('typedIn', () => {
  it('is everything typed into a box nothing was put in', () => {
    expect(typedIn('i want a dr', '', 11)).toBe('i want a dr')
  })

  it('is nothing with the caret against a phrase put in the box', () => {
    expect(typedIn('Once in a blue moon', 'Once in a blue moon', 19)).toBe('')
  })

  it('is what comes after the phrase, up to the caret', () => {
    expect(typedIn('Once in a blue moon and the', 'Once in a blue moon', 27)).toBe('and the')
    expect(typedIn('Once in a blue moon and the', 'Once in a blue moon', 23)).toBe('and')
  })

  it('is the word the caret is in, back inside the phrase', () => {
    expect(typedIn('I want tea now', 'I want tea now', 10)).toBe('tea')
  })
})

describe('keepPhrased', () => {
  it('keeps the phrase while what is typed comes after it', () => {
    expect(keepPhrased('Once in a blue moon', 'Once in a blue moon and')).toBe('Once in a blue moon')
  })

  // Taking the last letter off "moon" and typing it back is typing "moon".
  it('ends it at the start of the word an edit inside it is in', () => {
    expect(keepPhrased('Once in a blue moon', 'Once in a blue moo')).toBe('Once in a blue ')
  })
})

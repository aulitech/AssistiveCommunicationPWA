import { describe, it, expect } from 'vitest'
import { plainPhrase } from '../../src/core/phrases'
import { search } from '../../src/core/search'

const P = (id: string, text: string) => plainPhrase(id, text, 'Library')
const texts = (found: { text: string }[]) => found.map(p => p.text)

const BOARD = [
  P('a', 'Talk to you later'),
  P('b', 'I will talk to you tomorrow'),
  P('c', 'Take the tea away'),
  P('d', 'Time to yawn loudly'),
  P('e', 'talk shop'),
]

describe('what is typed', () => {
  it('finds nothing for nothing', () => {
    expect(search(BOARD, '', {})).toEqual([])
    expect(search(BOARD, '   ', {})).toEqual([])
  })

  it('puts what begins with it first, then what holds it, then what it spells', () => {
    expect(texts(search(BOARD, 'ta', {}))).toEqual([
      'Talk to you later',
      'Take the tea away',
      'talk shop',
      'I will talk to you tomorrow',
    ])
    expect(texts(search(BOARD, 'ttyl', {}))).toEqual(['Talk to you later', 'Time to yawn loudly'])
  })

  // "at" used to find "that", "what" and "water": letters from the middle of a
  // word are not what anybody typing them is reaching for.
  it('finds inside a phrase only where a word begins', () => {
    expect(texts(search(BOARD, 'alk', {}))).toEqual([])
    expect(texts(search(BOARD, 'ea', {}))).toEqual([])
    expect(texts(search(BOARD, 'tea', {}))).toEqual(['Take the tea away'])
    expect(texts(search(BOARD, 'to you t', {}))).toEqual(['I will talk to you tomorrow'])
    expect(texts(search([P('w', 'I want water')], 'ater', {}))).toEqual([])
  })

  it('takes a word as beginning past a quote or bracket in front of it', () => {
    const quoted = [P('q', 'Say "quiet" please'), P('b', 'A drink (cold)')]
    expect(texts(search(quoted, 'quiet', {}))).toEqual(['Say "quiet" please'])
    expect(texts(search(quoted, '"qu', {}))).toEqual(['Say "quiet" please'])
    expect(texts(search(quoted, 'cold', {}))).toEqual(['A drink (cold)'])
    expect(texts(search(quoted, 'uiet', {}))).toEqual([])
  })

  it('takes a word as beginning after a hyphen', () => {
    const board = [P('h', 'A well-known face'), P('d', 'Yes - now'), P('s', 'Twenty-(one)')]
    expect(texts(search(board, 'known', {}))).toEqual(['A well-known face'])
    expect(texts(search(board, 'known fa', {}))).toEqual(['A well-known face'])
    expect(texts(search(board, 'nown', {}))).toEqual([])
    expect(texts(search(board, '- now', {}))).toEqual(['Yes - now'])
    expect(texts(search(board, 'one', {}))).toEqual(['Twenty-(one)'])
  })

  it('lists a phrase once, in the first group it belongs to', () => {
    const found = search([P('x', 'tt tt')], 'tt', {})
    expect(texts(found)).toEqual(['tt tt'])
  })

  it('ignores case, and the spaces around what was typed and inside it', () => {
    expect(texts(search(BOARD, '  TALK   TO ', {}))).toEqual(['Talk to you later', 'I will talk to you tomorrow'])
  })

  // The initials run from the first word, one word after another.
  it('spells only from the first word', () => {
    expect(texts(search(BOARD, 'tyl', {}))).toEqual([])
    expect(texts(search([P('q', '"Quiet" until now')], 'qun', {}))).toEqual(['"Quiet" until now'])
  })

  it('spells a hyphenated word as the words either side of it', () => {
    const board = [P('h', 'Well-known face'), P('d', 'Yes - now')]
    expect(texts(search(board, 'wkf', {}))).toEqual(['Well-known face'])
    expect(texts(search(board, 'wf', {}))).toEqual([])
    expect(texts(search(board, 'yn', {}))).toEqual(['Yes - now'])
  })

  it('orders each group by when its phrases were last used, the unused after in the order given', () => {
    const usage = { e: { count: 1, at: 300 }, c: { count: 9, at: 100 } }
    expect(texts(search(BOARD, 'ta', usage))).toEqual([
      'talk shop',
      'Take the tea away',
      'Talk to you later',
      'I will talk to you tomorrow',
    ])
  })

  // Nobody types the asterisks they can see are not there.
  it('matches the words rather than the markup', () => {
    expect(texts(search([P('m', '**Help** me up')], 'help me', {}))).toEqual(['**Help** me up'])
  })
})

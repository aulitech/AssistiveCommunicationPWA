import { describe, it, expect } from 'vitest'
import { linkMarkdown, linksIn, readLink, writeLink } from '../../src/core/links'
import { layout, stripMarkdown } from '../../src/core/markdown'

// Reading a link out of a paste or a drop. A clipboard and a drag carry the same
// shape, so the fixture below stands in for both.

const transfer = (types: Record<string, string>) =>
  ({ getData: (type: string) => types[type] ?? '' }) as unknown as DataTransfer

describe('finding the URL', () => {
  it('takes one from a uri-list, which is what a drag carries', () => {
    expect(readLink(transfer({ 'text/uri-list': 'https://cafe.example/menu' }))?.url).toBe(
      'https://cafe.example/menu',
    )
  })

  it('takes one from plain text, which is what a paste usually is', () => {
    expect(readLink(transfer({ 'text/plain': '  https://cafe.example/menu  ' }))?.url).toBe(
      'https://cafe.example/menu',
    )
  })

  it('skips the comment lines a uri-list is allowed to have', () => {
    const list = '# some comment\nhttps://cafe.example/menu\nhttps://other.example'
    expect(readLink(transfer({ 'text/uri-list': list }))?.url).toBe('https://cafe.example/menu')
  })

  // Not a link means the caller does nothing at all, and the browser pastes or
  // drops it the ordinary way.
  it('finds nothing in ordinary text', () => {
    expect(readLink(transfer({ 'text/plain': 'I would like a cup of tea' }))).toBeNull()
    expect(readLink(transfer({}))).toBeNull()
    expect(readLink(null)).toBeNull()
  })

  // Nothing here builds a real anchor today, but this text is copied to a
  // clipboard and pasted into things that will, and a board is a file people
  // hand to each other.
  it('refuses a scheme that is not for visiting a page', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      expect(readLink(transfer({ 'text/plain': url })), url).toBeNull()
    }
  })

  it('takes an email address, which is a thing somebody sends', () => {
    expect(readLink(transfer({ 'text/plain': 'mailto:sam@example.com' }))?.url).toBe('mailto:sam@example.com')
  })
})

describe('finding the label', () => {
  const url = 'https://cafe.example/menu'

  it('uses the text of a dragged link', () => {
    const html = '<meta charset="utf-8"><a href="https://cafe.example/menu">Today\'s menu</a>'
    expect(readLink(transfer({ 'text/uri-list': url, 'text/html': html }))?.label).toBe("Today's menu")
  })

  it('uses the page title a dragged tab carries', () => {
    const moz = `${url}\nThe Cafe — Menu`
    expect(readLink(transfer({ 'text/uri-list': url, 'text/x-moz-url': moz }))?.label).toBe('The Cafe — Menu')
  })

  // A bare URL is the common paste, and the site's name is short and speakable
  // where the address is neither.
  it('falls back to the site, without the www', () => {
    expect(readLink(transfer({ 'text/plain': 'https://www.cafe.example/menu/today' }))?.label).toBe('cafe.example')
  })

  it('falls back to the address for an email', () => {
    expect(readLink(transfer({ 'text/plain': 'mailto:sam@example.com' }))?.label).toBe('sam@example.com')
  })

  // A phrase reads newlines as new lines now, so a title carrying one would
  // turn a button into two.
  it('flattens a label onto one line', () => {
    const html = '<a href="https://cafe.example/menu">Today\'s\n   menu</a>'
    expect(readLink(transfer({ 'text/uri-list': url, 'text/html': html }))?.label).toBe("Today's menu")
  })

  it('falls back rather than yielding an empty label', () => {
    const html = '<a href="https://cafe.example/menu">   </a>'
    expect(readLink(transfer({ 'text/uri-list': url, 'text/html': html }))?.label).toBe('cafe.example')
  })
})

describe('writing it as markdown', () => {
  it('is a label and a URL the parser reads back', () => {
    const markdown = linkMarkdown({ url: 'https://cafe.example', label: 'The menu' })
    expect(markdown).toBe('[The menu](https://cafe.example)')
    expect(stripMarkdown(markdown)).toBe('The menu')
  })

  // The parser has no escapes: the first `]` closes the label and the first `)`
  // closes the URL, so neither may contain one or the link comes apart.
  it('keeps a bracket in the label from closing it early', () => {
    const markdown = linkMarkdown({ url: 'https://cafe.example', label: 'Menu [new]' })
    expect(stripMarkdown(markdown)).toBe('Menu new')
  })

  // Only the closing one has to go: the first `)` ends the URL, so an earlier
  // one would cut it in half. An opening bracket ends nothing and is left be.
  it('encodes a bracket in the URL rather than letting it end the link', () => {
    const markdown = linkMarkdown({ url: 'https://example.com/a_(b)', label: 'Page' })
    expect(stripMarkdown(markdown)).toBe('Page')

    const [piece] = layout([{ kind: 'text', text: markdown }])[0].pieces
    expect(piece.kind === 'text' && decodeURIComponent(piece.link ?? '')).toBe('https://example.com/a_(b)')
  })
})

/**
 * **The links in a message**, as the message box offers them to edit: each
 * as its text and its address, wherever it stands.
 */
describe('linksIn', () => {
  it('finds a link marked up, and an address written out', () => {
    const text = 'See [the menu](https://example.com/menu) or https://example.org.'
    expect(linksIn(text)).toEqual([
      { start: 4, end: 40, label: 'the menu', url: 'https://example.com/menu' },
      { start: 44, end: 63, label: '', url: 'https://example.org' },
    ])
  })

  it('does not count the address inside a link a second time', () => {
    expect(linksIn('[x](https://a.com)')).toHaveLength(1)
  })

  it('finds nothing in words with no address', () => {
    expect(linksIn('Nothing to see at example dot com')).toEqual([])
  })
})

describe('writeLink', () => {
  it('writes the text and the address as a link', () => {
    expect(writeLink({ label: 'Menu', url: 'https://a.com' })).toBe('[Menu](https://a.com)')
  })

  it('writes the address alone when there is no text, and the text alone when there is no address', () => {
    expect(writeLink({ label: '', url: 'https://a.com' })).toBe('https://a.com')
    expect(writeLink({ label: '  ', url: 'https://a.com' })).toBe('https://a.com')
    expect(writeLink({ label: 'Menu', url: '  ' })).toBe('Menu')
  })

  // Written on every key, so a space typed between two words is kept.
  it('keeps the spaces typed in the text', () => {
    expect(writeLink({ label: 'the ', url: 'https://a.com' })).toBe('[the ](https://a.com)')
  })

  it('keeps out what would end it early, and reads back as it was written', () => {
    const written = writeLink({ label: 'a [b] c', url: 'https://a.com/x) y' })
    expect(written).toBe('[a b c](https://a.com/x%29%20y)')
    expect(linksIn(written)).toEqual([
      { start: 0, end: written.length, label: 'a b c', url: 'https://a.com/x%29%20y' },
    ])
  })
})

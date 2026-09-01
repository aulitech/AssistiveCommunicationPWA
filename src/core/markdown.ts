// Markdown in a phrase.
//
// A phrase is a button caption that also gets spoken, so markdown here is a way
// of making one readable at a glance — the word that matters in bold, a couple
// of options as a list — and nothing more. What the eye sees is the styled text;
// what the ear hears, and what a search matches on, is the words with the markup
// taken out. `stripMarkdown` and the renderer walk the same parse, so the two
// can never disagree about what a phrase actually says.
//
// Three deliberate narrowings, each of which costs nothing and avoids a whole
// class of surprise on a board somebody speaks with:
//
//  * **Underscores emphasise between words, never inside one.** `_like this_`
//    is italic and `snake_case_name` is a name, which is the rule every
//    markdown that supports both delimiters settles on. Asterisks carry no such
//    restriction, because nobody writes `snake*case*name` by accident.
//  * **Markup never crosses a slot.** Slots are parsed out before any of this
//    runs, so `**Please turn {control} on**` emphasises the two halves rather
//    than the whole. The shipped table has slots and no markdown; a phrase
//    somebody writes has markdown and, in practice, no slots.
//  * **A heading is a style, not a heading element.** The cell is a button. A
//    real `<h2>` inside one is a lie to a screen reader, which is reading the
//    plain text off the button's own label anyway. A link is drawn the same
//    way and for the same reason — and because a phrase's job is to be spoken,
//    not to take somebody away from the board they are speaking with.
//
// A link's URL rides in `Style` while its label is the run's own text, so
// everything that reads a phrase's words gets the label and never the URL
// without having to know that links exist.

import { type Segment, type Slot } from './phrases'

export interface Style {
  strong?: boolean
  em?: boolean
  strike?: boolean
  code?: boolean
  /**
   * Where this run points, when it is a link. The label is the run's own text,
   * so everything that reads a phrase's words — speech, search, the button's
   * label — gets the label and never the URL, without knowing links exist.
   */
  link?: string
}

export type Piece = ({ kind: 'text'; text: string } & Style) | { kind: 'slot'; slot: Slot }

export interface Line {
  kind: 'para' | 'heading' | 'item'
  /** 1–3, from the number of `#`. Only on a heading. */
  level?: number
  pieces: Piece[]
}

/**
 * Longest marker first, so `***both***` is read as one thing rather than as
 * `**` wrapping a stray `*`.
 */
const DELIMITERS: { marker: string; style: Style }[] = [
  { marker: '***', style: { strong: true, em: true } },
  { marker: '___', style: { strong: true, em: true } },
  { marker: '**', style: { strong: true } },
  { marker: '__', style: { strong: true } },
  { marker: '~~', style: { strike: true } },
  { marker: '*', style: { em: true } },
  { marker: '_', style: { em: true } },
]

/**
 * Whether an underscore run here is between words rather than inside one, which
 * is the only place it may open or close emphasis. Without this, `snake_case`
 * and a phrase like "the file_name field" come apart in the middle.
 */
const WORD = /[\p{L}\p{N}]/u
const betweenWords = (text: string, at: number) => at < 0 || at >= text.length || !WORD.test(text[at])

/**
 * Whether a string is worth parsing at all. The shipped table is two and a half
 * thousand phrases with none of this in them, and search runs over all of them
 * on every keystroke — so the common answer has to be cheap.
 */
const MARKERS = /[*~`_[\n]|^[ \t]*(?:#{1,3}|-) /m

export const hasMarkdown = (raw: string) => MARKERS.test(raw)

/**
 * Where `marker` next closes, or -1. Empty content does not count as a pair —
 * read as one it would delete itself and leave nothing behind, when what was
 * typed was some characters.
 *
 * An underscore run has to close between words as well as open between them, so
 * candidates that fall inside a word are stepped over rather than given up on:
 * `_a_b_` closes on the last one, not the middle.
 */
function findClose(text: string, from: number, marker: string): number {
  const wordSafe = marker[0] === '_'
  for (let at = text.indexOf(marker, from); at !== -1; at = text.indexOf(marker, at + 1)) {
    if (at <= from) continue
    if (!wordSafe || betweenWords(text, at + marker.length)) return at
  }
  return -1
}

const applied = (style: Style, wanted: Style) => Object.keys(wanted).every(key => style[key as keyof Style])

/**
 * A `[label](url)` starting at `at`, or null. Both halves must be there and
 * neither may be empty — `[see this]` on its own is a pair of brackets somebody
 * typed, the same way a lone `*` is an asterisk.
 *
 * The first `]` closes the label and the first `)` closes the URL, so neither
 * may contain one. `linkMarkdown` is what puts them in that shape; a URL with a
 * bracket in it arrives percent-encoded.
 */
function readLink(text: string, at: number): { label: string; url: string; end: number } | null {
  const close = text.indexOf(']', at + 1)
  if (close === -1 || close === at + 1 || text[close + 1] !== '(') return null
  const end = text.indexOf(')', close + 2)
  if (end === -1 || end === close + 2) return null
  return { label: text.slice(at + 1, close), url: text.slice(close + 2, end), end: end + 1 }
}

/** The styled runs inside one line of text. */
function parseInline(text: string, style: Style = {}, out: Piece[] = []): Piece[] {
  let plain = ''
  const flush = () => {
    if (plain) out.push({ kind: 'text', text: plain, ...style })
    plain = ''
  }

  let i = 0
  while (i < text.length) {
    // Code first and without recursion: the whole point of it is that what is
    // inside is not markup.
    if (text[i] === '`') {
      const end = findClose(text, i + 1, '`')
      if (end !== -1) {
        flush()
        out.push({ kind: 'text', text: text.slice(i + 1, end), ...style, code: true })
        i = end + 1
        continue
      }
    }

    // A link before the delimiters, so `[**bold**](url)` reads as a link with
    // bold inside it rather than the other way round.
    if (text[i] === '[' && !style.link) {
      const link = readLink(text, i)
      if (link) {
        flush()
        parseInline(link.label, { ...style, link: link.url }, out)
        i = link.end
        continue
      }
    }

    const delimiter = DELIMITERS.find(
      d =>
        text.startsWith(d.marker, i) &&
        !applied(style, d.style) &&
        // An underscore only opens where a word is not already running.
        (d.marker[0] !== '_' || betweenWords(text, i - 1)),
    )
    if (delimiter) {
      const end = findClose(text, i + delimiter.marker.length, delimiter.marker)
      if (end !== -1) {
        flush()
        parseInline(text.slice(i + delimiter.marker.length, end), { ...style, ...delimiter.style }, out)
        i = end + delimiter.marker.length
        continue
      }
    }

    // An opener with nothing closing it is not markup, it is a character
    // somebody typed.
    plain += text[i]
    i++
  }

  flush()
  return out
}

/** The kind of line this is, and the text left once its marker is taken off. */
function lineKind(text: string): { kind: Line['kind']; level?: number; rest: string } {
  const heading = /^[ \t]*(#{1,3}) (.*)$/.exec(text)
  if (heading) return { kind: 'heading', level: heading[1].length, rest: heading[2] }
  // `- ` and `* ` both start a bullet. `*emphasis*` has no space after the
  // asterisk, which is what keeps the two apart.
  const item = /^[ \t]*[-*] (.*)$/.exec(text)
  if (item) return { kind: 'item', rest: item[1] }
  return { kind: 'para', rest: text }
}

/** What a line holds before any markup in it has been read. */
type Raw = { kind: 'text'; text: string } | { kind: 'slot'; slot: Slot }

/**
 * Segments regrouped into lines. A slot joins whichever line is open; a text
 * segment with newlines in it starts a new one at each.
 */
function rawLines(segments: Segment[]): Raw[][] {
  const lines: Raw[][] = [[]]
  const last = () => lines[lines.length - 1]

  for (const segment of segments) {
    if (segment.kind === 'slot') {
      last().push({ kind: 'slot', slot: segment })
      continue
    }
    segment.text.split('\n').forEach((row, index) => {
      if (index > 0) lines.push([])
      if (row !== '') last().push({ kind: 'text', text: row })
    })
  }
  return lines
}

/**
 * A phrase laid out for drawing: its lines, and the styled runs and slots in
 * each. Slots pass through untouched — they are already parsed, and they carry
 * the options the slot picker offers.
 */
export function layout(segments: Segment[]): Line[] {
  return rawLines(segments).map(raw => {
    const line: Line = { kind: 'para', pieces: [] }
    raw.forEach((item, index) => {
      if (item.kind === 'slot') {
        line.pieces.push(item)
        return
      }
      // Only what starts a line can be a heading or a bullet. A `-` further
      // along it is a hyphen somebody typed.
      if (index === 0) {
        const { kind, level, rest } = lineKind(item.text)
        line.kind = kind
        if (level !== undefined) line.level = level
        parseInline(rest, {}, line.pieces)
      } else {
        parseInline(item.text, {}, line.pieces)
      }
    })
    return line
  })
}

/**
 * The URL of a phrase that is nothing but a link, or null.
 *
 * Choosing one of these opens it instead of speaking it, so the line has to be
 * drawn somewhere — and it is drawn here, at "the link is the whole phrase".
 * `[Today's menu](…)` is a button for going somewhere and reads as nothing said
 * aloud; "Have a look at [the menu](…) later" is a sentence somebody built, and
 * a sentence must never lose its voice to a browser tab.
 *
 * Styling inside the label is fine — `[**Menu**](…)` is several runs of the
 * same link — but a slot, a second line or a word outside the link is not.
 */
export function soleLink(segments: Segment[]): string | null {
  const lines = layout(segments)
  if (lines.length !== 1) return null

  const urls = new Set<string>()
  for (const piece of lines[0].pieces) {
    if (piece.kind === 'slot') return null
    if (piece.link) urls.add(piece.link)
    // Whitespace either side of the link is not a word.
    else if (piece.text.trim() !== '') return null
  }
  return urls.size === 1 ? [...urls][0] : null
}

/**
 * The words, with the markup taken out — what gets spoken, what a search
 * matches, and what a screen reader is told. Built from the same parse the
 * renderer uses, so it says exactly what the cell shows.
 */
export function stripMarkdown(raw: string): string {
  if (!hasMarkdown(raw)) return raw
  return raw
    .split('\n')
    .map(row => {
      const { rest } = lineKind(row)
      return parseInline(rest)
        .map(piece => (piece.kind === 'text' ? piece.text : ''))
        .join('')
    })
    .join('\n')
    .trim()
}

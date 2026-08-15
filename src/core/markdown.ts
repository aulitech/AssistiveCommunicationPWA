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
//  * **Emphasis is asterisks only.** `_like this_` stays literal, because the
//    placeholder for a slot with nothing behind it is `___` — see `BLANK` — and
//    a parser that ate underscores would swallow the one affordance a
//    fill-in-the-blank phrase has. It keeps `snake_case` intact too.
//  * **Markup never crosses a slot.** Slots are parsed out before any of this
//    runs, so `**Please turn {control} on**` emphasises the two halves rather
//    than the whole. The shipped table has slots and no markdown; a phrase
//    somebody writes has markdown and, in practice, no slots.
//  * **A heading is a style, not a heading element.** The cell is a button. A
//    real `<h2>` inside one is a lie to a screen reader, which is reading the
//    plain text off the button's own label anyway.

import { type Segment, type Slot } from './phrases'

export interface Style {
  strong?: boolean
  em?: boolean
  strike?: boolean
  code?: boolean
}

export type Piece =
  | ({ kind: 'text'; text: string } & Style)
  | { kind: 'slot'; slot: Slot }

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
  { marker: '**', style: { strong: true } },
  { marker: '~~', style: { strike: true } },
  { marker: '*', style: { em: true } },
]

/**
 * Whether a string is worth parsing at all. The shipped table is two and a half
 * thousand phrases with none of this in them, and search runs over all of them
 * on every keystroke — so the common answer has to be cheap.
 */
const MARKERS = /[*~`\n]|^[ \t]*(?:#{1,3}|-) /m

export const hasMarkdown = (raw: string) => MARKERS.test(raw)

/** Where `marker` next closes, or -1. Empty content does not count as a pair. */
function findClose(text: string, from: number, marker: string): number {
  const at = text.indexOf(marker, from)
  return at > from ? at : -1
}

const applied = (style: Style, wanted: Style) =>
  Object.keys(wanted).every(key => style[key as keyof Style])

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

    const delimiter = DELIMITERS.find(d => text.startsWith(d.marker, i) && !applied(style, d.style))
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

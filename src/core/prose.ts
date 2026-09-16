// Shared shape for the app's long-form text — the help guide and the legal
// pages. Kept as data rather than markup so it stays readable and testable.

export type ProseBlock = { kind: 'text'; text: string } | { kind: 'list'; items: string[] }

export interface ProseSection {
  title: string
  blocks: ProseBlock[]
}

export interface ProseDocument {
  title: string
  updated: string
  intro?: string
  sections: ProseSection[]
}

export const text = (t: string): ProseBlock => ({ kind: 'text', text: t })
export const list = (...items: string[]): ProseBlock => ({ kind: 'list', items })

/**
 * An icon named in a line of prose, as `:speak:`.
 *
 * **A guide that names a button has to show it.** Every control in this app is a
 * glyph and nothing else — there is no room on a border for a word — so "rest on
 * the speaker button" asks somebody to match a description against a picture,
 * which is the one thing this app's readers are least able to do quickly. The
 * mark is written in the prose and the icon is drawn where it stands.
 *
 * **Colons rather than braces**, which was the first thing tried and is the one
 * shape this text cannot use: the guide teaches `{pronouns}` and `{'red',
 * 'blue'}` as the syntax for a phrase's own choices, so a brace-delimited icon
 * mark would have eaten the very words explaining it. Lower case and hyphens
 * between, so nothing in an address or a time can look like one.
 */
const ICON_MARK = /:([a-z][a-z-]*):/g

/** One run of a line: either words to read or the name of an icon to draw. */
export type ProsePiece = { word: string } | { icon: string }

/**
 * A line broken into what to read and what to draw.
 *
 * Empty runs are dropped, so a line that is nothing but an icon is one piece and
 * a line with no icon in it is one piece too — which is the common case and the
 * one worth not making a component do any work for.
 */
export function prosePieces(line: string): ProsePiece[] {
  const pieces: ProsePiece[] = []
  let at = 0
  for (const found of line.matchAll(ICON_MARK)) {
    if (found.index > at) pieces.push({ word: line.slice(at, found.index) })
    pieces.push({ icon: found[1]! })
    at = found.index + found[0].length
  }
  if (at < line.length) pieces.push({ word: line.slice(at) })
  return pieces
}

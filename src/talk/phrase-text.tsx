// Drawing a phrase: its slots, and any markdown in it.
//
// One component, used by the grid cell and by the emergency bar, so a phrase
// looks the same wherever it is shown. Everything about *what* the markup means
// lives in `core/markdown`; this only turns the result into elements.
//
// A heading is drawn as a style rather than as a heading element, and a list as
// styled lines rather than a `<ul>`. Both of these sit inside a `role="button"`,
// where real document structure would be a lie to a screen reader — which is
// reading the plain text off the button's own label in any case.

import { layout, type Line, type Piece } from '../core/markdown'
import { type Segment } from '../core/phrases'
import { cx } from '../ui/style'

function PieceEl({ piece }: { piece: Piece }) {
  if (piece.kind === 'slot') {
    return (
      <span className={cx('phrase-slot', piece.slot.options.length === 0 && 'is-blank')}>{piece.slot.label}</span>
    )
  }
  const className = cx(
    piece.strong && 'md-strong',
    piece.em && 'md-em',
    piece.strike && 'md-strike',
    piece.code && 'md-code',
    // Drawn as a link, not built as one. The cell around it is a dwell button
    // whose job is to speak; a real anchor inside it would give a gaze user two
    // targets in one place, and the one they did not mean takes the board away
    // mid-sentence.
    piece.link && 'md-link',
  )
  // No wrapper for a piece with nothing to say about itself, so a phrase without
  // markdown draws exactly what it drew before any of this existed.
  return className ? <span className={className}>{piece.text}</span> : <>{piece.text}</>
}

const pieces = (line: Line) => line.pieces.map((piece, i) => <PieceEl key={i} piece={piece} />)

function LineEl({ line }: { line: Line }) {
  if (line.kind === 'para') return <span className="md-line">{pieces(line)}</span>
  return (
    <span className={cx('md-line', line.kind === 'item' ? 'md-item' : `md-heading md-h${line.level ?? 1}`)}>
      {/* Drawn rather than typed, so the bullet cannot be selected, searched or
          spoken — it is not part of what the phrase says. */}
      {line.kind === 'item' && <span className="md-bullet" aria-hidden="true" />}
      {pieces(line)}
    </span>
  )
}

/**
 * The phrase, laid out. Cheap for a phrase with no markup in it — which is every
 * one of the two and a half thousand Peri ships — because the parse gives up on
 * the first character when there is nothing to find.
 */
export function PhraseText({ segments }: { segments: Segment[] }) {
  const lines = layout(segments)
  // One unstyled line is the overwhelmingly common case, and it draws with no
  // wrapper at all — nothing for the grid's row height to notice.
  if (lines.length === 1 && lines[0].kind === 'para') return <>{pieces(lines[0])}</>
  return (
    <>
      {lines.map((line, i) => (
        <LineEl key={i} line={line} />
      ))}
    </>
  )
}

// **A link in the message box, edited as its text and where it goes.** A link
// is `[text](address)` in the box, and changing either half meant aiming a
// caret between brackets — the fiddliest thing a gaze can be asked to do. So
// while the box holds a link, the card offers two fields for each: what it
// says, and the address. What is typed in them is written back into the box as
// it is typed.

import { useMemo, useState } from 'react'
import { linksIn, writeLink, type LinkAt } from '../core/links'
import { DwellInput } from '../ui/controls'

/** The link being edited, held while its fields have focus. */
interface Editing {
  /** Where it starts in the box, and how much of the box it is now. */
  start: number
  length: number
  label: string
  url: string
}

export function LinkFields({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const links = useMemo(() => linksIn(text), [text])
  // **Held while it is being edited**, not read back from the box: an address
  // emptied to be typed again is, for a moment, not a link at all, and a row
  // read from the box would go from under the field being typed in.
  const [editing, setEditing] = useState<Editing | null>(null)

  const rows: (LinkAt | Editing)[] = editing
    ? [...links.filter(l => l.start !== editing.start), editing].sort((a, b) => a.start - b.start)
    : links
  if (rows.length === 0) return null

  const begin = (row: LinkAt | Editing) =>
    setEditing(was =>
      was && was.start === row.start
        ? was
        : {
            start: row.start,
            length: 'end' in row ? row.end - row.start : row.length,
            label: row.label,
            url: row.url,
          },
    )
  const change = (row: LinkAt | Editing, next: { label: string; url: string }) => {
    const at = editing && editing.start === row.start ? editing : null
    const length = at ? at.length : 'end' in row ? row.end - row.start : row.length
    const written = writeLink(next)
    onChange(text.slice(0, row.start) + written + text.slice(row.start + length))
    setEditing({ start: row.start, length: written.length, ...next })
  }
  // Let go once focus leaves the row altogether — not on going from one of its
  // fields to the other.
  const end = (e: React.FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditing(null)
  }

  return (
    <div className="link-fields" role="group" aria-label="Links in the message">
      {rows.map(row => (
        <div key={row.start} className="link-row" onBlur={end}>
          <label className="link-field">
            <span>Text</span>
            <DwellInput
              className="link-input"
              aria-label="Link text"
              value={row.label}
              onFocus={() => begin(row)}
              onChange={e => change(row, { label: e.target.value, url: row.url })}
            />
          </label>
          <label className="link-field">
            <span>Link</span>
            <DwellInput
              className="link-input"
              aria-label="Link address"
              inputMode="url"
              value={row.url}
              onFocus={() => begin(row)}
              onChange={e => change(row, { label: row.label, url: e.target.value })}
            />
          </label>
        </div>
      ))}
    </div>
  )
}

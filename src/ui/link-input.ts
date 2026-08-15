// Pasting or dropping a link into a text box.
//
// Both routes end the same way: the link becomes `[label](url)` and goes into
// the box as text. Anything that is not a link is left alone entirely, so an
// ordinary paste still pastes and a dragged word still drops.
//
// Where it lands differs between the two on purpose. A paste goes to the caret,
// because the caret is somewhere the user put it. A drop goes to the end, with a
// space in front of it: a drop comes from outside the box and carries no caret
// of its own, and browsers disagree about where one would be — appending is at
// least the same answer every time.

import { useCallback } from 'react'
import { linkMarkdown, readLink } from '../core/links'

export function useLinkInput(
  textarea: React.RefObject<HTMLTextAreaElement | null>,
  /** Hands back the whole new value and where the caret should end up in it. */
  onChange: (next: string, caret: number) => void,
) {
  const drop = useCallback(
    (data: DataTransfer | null, atCaret: boolean, event: { preventDefault: () => void }) => {
      const link = readLink(data)
      if (!link) return
      const el = textarea.current
      if (!el) return
      event.preventDefault()

      const markdown = linkMarkdown(link)
      const value = el.value
      const [from, to] = atCaret ? [el.selectionStart, el.selectionEnd] : [value.length, value.length]
      const before = value.slice(0, from)
      const after = value.slice(to)
      const separator = before && !/\s$/.test(before) ? ' ' : ''
      const next = before + separator + markdown + after

      onChange(next, before.length + separator.length + markdown.length)
    },
    [textarea, onChange],
  )

  return {
    onPaste: useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => drop(e.clipboardData, true, e),
      [drop],
    ),
    onDrop: useCallback((e: React.DragEvent<HTMLTextAreaElement>) => drop(e.dataTransfer, false, e), [drop]),
    // Without this the browser refuses the drop, and the page navigates to the
    // link instead — which for somebody mid-sentence takes the board away.
    onDragOver: useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
      if (e.dataTransfer?.types?.includes('text/uri-list')) e.preventDefault()
    }, []),
  }
}

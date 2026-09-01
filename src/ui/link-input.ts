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
import { linkMarkdown, readLink, readLinkText } from '../core/links'

/** What came of asking the clipboard for its contents. */
export type PasteResult = 'pasted' | 'empty' | 'refused'

export function useLinkInput(
  textarea: React.RefObject<HTMLTextAreaElement | null>,
  /** Hands back the whole new value and where the caret should end up in it. */
  onChange: (next: string, caret: number) => void,
) {
  /** Put `insertion` in, either over the selection or at the end. */
  const splice = useCallback(
    (insertion: string, atCaret: boolean) => {
      const el = textarea.current
      if (!el) return
      const value = el.value
      const [from, to] = atCaret ? [el.selectionStart, el.selectionEnd] : [value.length, value.length]
      const before = value.slice(0, from)
      const after = value.slice(to)
      const separator = before && !/\s$/.test(before) ? ' ' : ''
      const next = before + separator + insertion + after

      onChange(next, before.length + separator.length + insertion.length)
    },
    [textarea, onChange],
  )

  const drop = useCallback(
    (data: DataTransfer | null, atCaret: boolean, event: { preventDefault: () => void }) => {
      const link = readLink(data)
      if (!link) return
      if (!textarea.current) return
      event.preventDefault()
      splice(linkMarkdown(link), atCaret)
    },
    [textarea, splice],
  )

  /**
   * Ask the clipboard for its contents and put them in at the caret.
   *
   * The keyboard route into a text box is Ctrl-V, and a dwell user has no
   * Ctrl-V — so a control has to ask on their behalf. **It can be refused**, and
   * for the people this app is for it is the likely case rather than the
   * unlikely one: reading the clipboard needs permission and, in most browsers,
   * a recent click or key press, and a dwell is a timer firing after a pointer
   * has rested. Firefox does not offer it to a page at all. So this says which
   * of the three things happened and the caller says it out loud — the same
   * bargain `openLink` strikes, for the same reason.
   */
  const pasteFromClipboard = useCallback(async (): Promise<PasteResult> => {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      return 'refused'
    }
    if (!text) return 'empty'
    // A pasted address becomes the page's name, exactly as a Ctrl-V would.
    const link = readLinkText(text)
    splice(link ? linkMarkdown(link) : text, true)
    return 'pasted'
  }, [splice])

  return {
    pasteFromClipboard,
    onPaste: useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => drop(e.clipboardData, true, e), [drop]),
    onDrop: useCallback((e: React.DragEvent<HTMLTextAreaElement>) => drop(e.dataTransfer, false, e), [drop]),
    // Without this the browser refuses the drop, and the page navigates to the
    // link instead — which for somebody mid-sentence takes the board away.
    onDragOver: useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
      if (e.dataTransfer?.types?.includes('text/uri-list')) e.preventDefault()
    }, []),
  }
}

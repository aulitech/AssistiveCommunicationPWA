// The icons a line of prose may name, as `:speak:` — see `prosePieces`.
//
// **A guide that names a button has to show it.** Every control in this app is a
// glyph and nothing else, because there is no room on a border for a word — so
// "rest on the speaker button" asks somebody to match a description against a
// picture, which is the one thing this app's readers are least able to do
// quickly. The mark goes in the prose and the icon is drawn where it stands.
//
// Its own module rather than a map inside `controls.tsx`, for the reason
// `style.ts` and `settle.ts` are: this is a lookup table, not a component, and a
// file mixing the two loses fast refresh for everything importing it.
//
// A name that is not here draws nothing rather than the braces it was written
// in — `tests/app/structure.test.ts` holds every name the guide and the legal
// pages use to this list, so a mark that draws nothing fails the build instead
// of quietly leaving a sentence with a hole in it.

import {
  AutoSpeakIcon,
  CheckIcon,
  ClearIcon,
  CopyIcon,
  CustomOrderIcon,
  EditIcon,
  KeyboardIcon,
  MenuIcon,
  MicIcon,
  PasteIcon,
  PlusIcon,
  QuestionIcon,
  ReorderIcon,
  ResetIcon,
  SortAlphaIcon,
  SpeakIcon,
  SuggestIcon,
  TrashIcon,
  UndoIcon,
} from './icons'

/** Named for what the control *does*, which is what the prose around it says. */
export const PROSE_ICONS: Record<string, () => React.ReactElement> = {
  speak: SpeakIcon,
  clear: ClearIcon,
  undo: UndoIcon,
  copy: CopyIcon,
  paste: PasteIcon,
  save: CheckIcon,
  delete: TrashIcon,
  add: PlusIcon,
  menu: MenuIcon,
  keyboard: KeyboardIcon,
  edit: EditIcon,
  'auto-speak': AutoSpeakIcon,
  listen: QuestionIcon,
  mic: MicIcon,
  suggest: SuggestIcon,
  arrange: ReorderIcon,
  alphabetical: SortAlphaIcon,
  'own-order': CustomOrderIcon,
  reset: ResetIcon,
}

/**
 * What each is called, drawn beside it the first time a section uses it — see
 * `sectionPieces`. The words the control itself answers to, where it has them,
 * so the guide and a screen reader call it the same thing.
 */
export const PROSE_ICON_NAMES: Record<string, string> = {
  speak: 'Speak',
  clear: 'Clear',
  undo: 'Undo',
  copy: 'Copy',
  paste: 'Paste',
  save: 'Save',
  delete: 'Delete',
  add: 'Add',
  menu: 'Menu',
  keyboard: 'Keyboard',
  edit: 'Edit',
  'auto-speak': 'Auto-speak',
  listen: 'Listen',
  mic: 'Microphone',
  suggest: 'Suggest answers',
  arrange: 'Arrange',
  alphabetical: 'A to Z',
  'own-order': 'Custom order',
  reset: 'Reset',
}

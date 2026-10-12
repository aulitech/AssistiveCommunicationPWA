// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { PRESENTATION_BACKGROUND_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── The picture behind the presentation window ────────────────────────────────
// **This device's, and nowhere else.** Not a setting: settings travel to the
// other devices and into every backup, and a picture is hundreds of times the
// size of everything else in them put together. So it is kept here under a name
// of its own, as an image already made small enough to keep — see
// `menu/settings-panel.tsx`, which makes it so.

/** The picture as a `data:` URL, or empty for none. */
export function loadPresentationBackground(): string {
  try {
    const raw = localStorage.getItem(storageKey(PRESENTATION_BACKGROUND_KEY))
    return raw?.startsWith('data:image/') ? raw : ''
  } catch {
    return ''
  }
}

/** Keeps the picture, or takes it away for empty — and says whether it was kept. */
export function savePresentationBackground(url: string): boolean {
  if (!url) {
    localStorage.removeItem(storageKey(PRESENTATION_BACKGROUND_KEY))
    return true
  }
  return writeKey(storageKey(PRESENTATION_BACKGROUND_KEY), url)
}

/** Whether a change to storage was to the picture — the presentation window follows it live. */
export const isPresentationBackground = (key: string | null) => key === storageKey(PRESENTATION_BACKGROUND_KEY)

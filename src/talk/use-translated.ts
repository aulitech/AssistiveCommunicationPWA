// What has been said in another language, as phrases that can be said again.
//
// The Sent list's twin, and deliberately built to the same shape. Both are a
// record of what somebody actually said rather than anything they made, so both
// have their own storage key, neither is ever in a backup, and neither is a
// category — a tab pinned where it can be learnt, holding a list in the order
// it happened.
//
// What is different is why it is worth having. **The board stays in the user's
// own words and the translation is what comes out**, so until now a translation
// existed only for as long as it took to speak: there was nowhere to see what
// had been said, and no way to say it again without going back through the
// service and paying for it twice. A cell here holds the words that came out,
// with the board's own wording under them.
//
// Three things about it:
//
//   * **A cell carries its own language**, and is said in that language without
//     being translated again. One phrase said in two languages is two entries.
//   * **It is spoken in the voice remembered for that language.** Choosing a
//     voice while the board spoke Spanish is what `voicesByLanguage` is for, and
//     a Spanish cell is exactly the case it exists to answer.
//   * **Nothing is recorded here that was not translated.** A phrase spoken as
//     it was written — no language set, nothing able to translate it, a service
//     that refused — is not a translation, and an entry claiming otherwise would
//     be wrong in a list somebody reads.

import { useCallback, useMemo, useState } from 'react'
import { addTranslated, loadTranslated, saveTranslated, type Settings, type Translated } from '../core/store'
import { plainPhrase, type Phrase } from '../core/phrases'

/** The category its phrases claim, and the word on its tab. */
export const TRANSLATED_CATEGORY = 'Translations'

/**
 * The filter id. The leading space keeps it out of reach of a real category,
 * exactly as `SENT_FILTER` does: names are trimmed before they are saved, so
 * none can ever collide with this.
 */
export const TRANSLATED_FILTER = ' translations'

/**
 * The voice a translated phrase is said in.
 *
 * The one remembered for its language, falling back to the board's own. A cell
 * here was recorded while the board was set to that language, so the voice
 * chosen under it is the voice it was heard in.
 */
export const voiceForTranslated = (settings: Settings, tag: string): string =>
  settings.voicesByLanguage[tag] || settings.voiceURI

export function useTranslated() {
  const [list, setList] = useState<Translated[]>(loadTranslated)

  const write = useCallback((next: Translated[]) => {
    saveTranslated(next)
    setList(next)
  }, [])

  // Both of these read storage back rather than closing over `list`, for the
  // reason the Sent list does: two phrases can be spoken without a render in
  // between, and the second would otherwise be written against a list that no
  // longer exists. It matters more here — the service path resolves whenever it
  // resolves, so two of these can land in any order at all.
  const record = useCallback(
    (source: string, text: string, tag: string) => write(addTranslated(loadTranslated(), source, text, tag)),
    [write],
  )

  const forget = useCallback((id: string) => write(loadTranslated().filter(t => t.id !== id)), [write])

  const phrases = useMemo<Phrase[]>(
    () =>
      list.map(t => ({
        ...plainPhrase(t.id, t.text, TRANSLATED_CATEGORY),
        detail: t.source,
        lang: t.tag,
      })),
    [list],
  )

  return { phrases, record, forget }
}

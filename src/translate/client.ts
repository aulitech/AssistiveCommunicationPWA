// Translating a phrase Peri does not ship a translation for.
//
// The shipped tables cover the phrases the app comes with. What they cannot
// cover is the half of a board that matters most to the person using it: the
// phrases they wrote themselves, the ones with a blank filled in, and a message
// composed out of several. Those go to DeepL, once each, and are remembered.
//
// **Nothing throws.** Failing to translate is not failing to speak: the caller
// says the words as they were written and the listener gets the original rather
// than silence. Every failure is a value, exactly as in `sync/client.ts`.

import { baseLanguage } from '../core/translation'

const FREE = 'https://api-free.deepl.com/v2'
const PRO = 'https://api.deepl.com/v2'

/** A free key ends in `:fx`, and the two plans are different hosts. */
const endpointFor = (key: string) => (key.trim().endsWith(':fx') ? FREE : PRO)

export type TranslateResult =
  | { status: 'ok'; text: string }
  | { status: 'error'; error: string }

function describe(status: number): string {
  if (status === 403) return 'That translation key was refused'
  if (status === 429) return 'Too many translations at once — try again in a moment'
  if (status === 456) return 'This month’s translation quota is used up'
  if (status >= 500) return 'The translation service is having trouble'
  return `The translation service said ${status}`
}

/** One phrase, into one language. */
export async function translate(text: string, tag: string, key: string): Promise<TranslateResult> {
  if (!text.trim() || !key) return { status: 'error', error: 'Nothing to translate' }

  try {
    const response = await fetch(`${endpointFor(key)}/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: [text],
        target_lang: baseLanguage(tag).toUpperCase(),
        // The board is written in English, and saying so is both faster and
        // better than letting six words be guessed at.
        source_lang: 'EN',
      }),
    })
    if (!response.ok) return { status: 'error', error: describe(response.status) }

    const body = (await response.json()) as { translations?: { text?: unknown }[] }
    const first = body.translations?.[0]?.text
    return typeof first === 'string' && first
      ? { status: 'ok', text: first }
      : { status: 'error', error: 'The translation service sent back nothing' }
  } catch {
    return { status: 'error', error: 'Could not reach the translation service' }
  }
}

/**
 * Check a key by using it, which is the only honest test of one.
 *
 * Same shape as linking an ElevenLabs account: a key that cannot translate a
 * single word is a key that will fail silently later, in the middle of a
 * sentence somebody needed.
 */
export async function checkKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await translate('Hello', 'de', key)
  return result.status === 'ok' ? { ok: true } : { ok: false, error: result.error }
}

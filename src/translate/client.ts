// Translating a phrase Peri does not ship a translation for.
//
// The shipped tables cover the phrases the app comes with. What they cannot
// cover is the half of a board that matters most to the person using it: the
// phrases they wrote themselves, the ones with a blank filled in, and a message
// composed out of several. Those go to Google, once each, and are remembered.
//
// **Nothing throws.** Failing to translate is not failing to speak: the caller
// says the words as they were written and the listener gets the original rather
// than silence. Every failure is a value, exactly as in `sync/client.ts`.

import { translationTarget } from '../core/translation'

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

export type TranslateResult =
  | { status: 'ok'; text: string }
  | { status: 'error'; error: string }

function describe(status: number): string {
  if (status === 400) return 'That translation key was refused'
  if (status === 403) return 'That key is not allowed to translate — check it is enabled for this site'
  if (status === 429) return 'Too many translations at once — try again in a moment'
  if (status >= 500) return 'The translation service is having trouble'
  return `The translation service said ${status}`
}

/**
 * Google hands back HTML-escaped text, **even when asked for plain text**.
 *
 * That is not cosmetic here. "I'm cold" comes back as `I&#39;m cold`, and a
 * synthesiser reads that out as "I ampersand hash thirty-nine m cold" — which
 * is a phrase somebody needed, spoken as nonsense. Decoded by hand rather than
 * through an element's `innerHTML`: this string is going to a speech engine and
 * a clipboard, and parsing it as markup to unescape it is how a board full of
 * other people's phrases becomes a way of running their script.
 */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      // A code point outside what a character can be is not an entity at all.
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** One phrase, into one language. */
export async function translate(text: string, tag: string, key: string): Promise<TranslateResult> {
  if (!text.trim() || !key) return { status: 'error', error: 'Nothing to translate' }
  const target = translationTarget(tag)
  if (!target) return { status: 'error', error: 'Nothing here translates into that' }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      // In a header rather than on the query string: a key in a URL ends up in
      // logs, in history and in a referrer.
      headers: { 'X-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: [text],
        target,
        // The board is written in English, and saying so is both quicker and
        // better than letting three words be guessed at.
        source: 'en',
        format: 'text',
      }),
    })
    if (!response.ok) return { status: 'error', error: describe(response.status) }

    const body = (await response.json()) as { data?: { translations?: { translatedText?: unknown }[] } }
    const first = body.data?.translations?.[0]?.translatedText
    return typeof first === 'string' && first
      ? { status: 'ok', text: decodeEntities(first) }
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

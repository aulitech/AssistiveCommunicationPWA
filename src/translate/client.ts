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
import { reportFailure } from '../core/report'

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

/**
 * **The key is Peri's, not the user's.** `VITE_GOOGLE_TRANSLATE_KEY`, out of
 * `.env.local` in development and out of the site's environment on a deploy,
 * inlined into the bundle by Vite.
 *
 * So it is public — anyone can read it out of the JavaScript — and what makes
 * that acceptable is the restriction on the key itself rather than any secrecy
 * about it: an HTTP-referrer restriction to this site, and an API restriction to
 * Cloud Translation alone. What a lifted key then costs is **quota, not data**;
 * it can translate, from this origin, and do nothing else. That is the same
 * trade the OAuth client IDs beside it already make.
 *
 * It was a field in Settings, and asking somebody who communicates by gaze to
 * open a Google Cloud account before their board can speak Spanish is not a
 * setting, it is a wall. The ElevenLabs key stays theirs because it bills them
 * for a voice they chose; this one bills us for a service they should not have
 * to know exists.
 *
 * Read per call rather than captured at module load, so a test can stub it and
 * so nothing here has an opinion about when the environment was decided.
 */
function translateKey(): string {
  const key: unknown = import.meta.env?.VITE_GOOGLE_TRANSLATE_KEY
  return typeof key === 'string' ? key.trim() : ''
}

/**
 * Whether this build can translate at all.
 *
 * The caller needs to know *before* it starts, not after: with no key the words
 * have to go out **in the same tick**, and a promise that resolves into the
 * original a moment later is a phrase that arrives after somebody needed it.
 */
export function hasTranslateKey(): boolean {
  return translateKey() !== ''
}

export type TranslateResult = { status: 'ok'; text: string } | { status: 'error'; error: string }

/** The failure as a value, and the same failure in the console. */
function fail(error: string): TranslateResult {
  reportFailure('translate', error)
  return { status: 'error', error }
}

function describe(status: number): string {
  if (status === 400) return 'The translation key was refused — check VITE_GOOGLE_TRANSLATE_KEY reached this build'
  if (status === 403)
    return 'The translation key is not allowed here — check its referrer restriction covers this site, and that Cloud Translation is enabled'
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
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      // A code point outside what a character can be is not an entity at all.
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** One phrase, into one language. */
export async function translate(text: string, tag: string): Promise<TranslateResult> {
  if (!text.trim()) return fail('Nothing to translate')
  // Named rather than lumped in with the rest, because this one is not a
  // service failing: it is a build that went out without its key, and the only
  // symptom on the board is a phrase quietly spoken in English.
  const key = translateKey()
  if (!key) return fail('No translation key was built into this app')
  const target = translationTarget(tag)
  if (!target) return fail(`Nothing here translates into ${tag}`)

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
    if (!response.ok) return fail(describe(response.status))

    const body = (await response.json()) as { data?: { translations?: { translatedText?: unknown }[] } }
    const first = body.data?.translations?.[0]?.translatedText
    return typeof first === 'string' && first
      ? { status: 'ok', text: decodeEntities(first) }
      : fail('The translation service sent back nothing')
  } catch {
    return fail('Could not reach the translation service')
  }
}

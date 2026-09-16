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

import { SOURCE_LANGUAGE, translationTarget } from '../core/translation'
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

/**
 * One piece of text, from one language into another.
 *
 * The codes are the service's own rather than the tags Peri stores — `tag` is
 * turned into one by `translationTarget` before it gets here. `source` may be
 * empty, which asks the service to work it out; that costs a little accuracy on
 * three words and is the only option in the one place it is used.
 */
async function ask(text: string, target: string, source: string): Promise<TranslateResult> {
  const key = translateKey()
  if (!key) return fail('No translation key was built into this app')

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      // In a header rather than on the query string: a key in a URL ends up in
      // logs, in history and in a referrer.
      headers: { 'X-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: [text], target, format: 'text', ...(source ? { source } : {}) }),
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

/** One phrase, into one language. */
export async function translate(text: string, tag: string): Promise<TranslateResult> {
  if (!text.trim()) return fail('Nothing to translate')
  const target = translationTarget(tag)
  if (!target) return fail(`Nothing here translates into ${tag}`)
  // The board is written in English, and saying so is both quicker and better
  // than letting three words be guessed at.
  return ask(text, target, SOURCE_LANGUAGE)
}

/**
 * A heard question, into the language the board is written in.
 *
 * **The other direction, and the only place this app goes that way.** Everything
 * else here translates *out* of the board so a listener can follow it; listen
 * mode translates *in*, so the person using the board can read what was asked.
 *
 * The source is deliberately not named. What the setting holds is what the board
 * is *spoken* as, and a question in the room may not be in it at all — a nurse
 * switching to English mid-sentence is the ordinary case, not an edge one — so
 * the service is left to work it out from the words themselves. Naming it wrongly
 * is worse than not naming it: the service would translate as though it had been
 * told the truth.
 */
export async function translateHeard(text: string): Promise<TranslateResult> {
  if (!text.trim()) return fail('Nothing to translate')
  return ask(text, SOURCE_LANGUAGE, '')
}

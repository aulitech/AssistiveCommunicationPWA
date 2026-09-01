// Talking to Google Cloud Translation.
//
// Nothing here throws. Failing to translate is not failing to speak: the caller
// says the words as they were written, and the listener gets the original
// rather than silence. Every failure is a value, exactly as in sync.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { decodeEntities, hasTranslateKey, translate } from '../../src/translate/client'
import { warnings } from '../setup'

const KEY = 'key-1234'

// The key is the build's, not the user's. `tests/setup.ts` clears it for every
// test, so anything that expects a request to go out has to put one back.
beforeEach(() => vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', KEY))

const answers = (body: unknown, init: ResponseInit = {}) => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
      ...init,
    }),
  )
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

afterEach(() => vi.unstubAllGlobals())

describe('a translation', () => {
  it('comes back as the translated words', async () => {
    answers({ data: { translations: [{ translatedText: 'Bonjour' }] } })
    expect(await translate('Good morning', 'fr-FR')).toEqual({ status: 'ok', text: 'Bonjour' })
  })

  it('asks for the base language, not the region', async () => {
    const fetcher = answers({ data: { translations: [{ translatedText: 'Buenos días' }] } })
    await translate('Good morning', 'es-MX')
    expect(JSON.parse(String(fetcher.mock.calls[0]![1].body)).target).toBe('es')
  })

  /**
   * The board is written in English, and saying so is both quicker and better
   * than letting six words be guessed at — "Get a doctor" is not much to go on.
   */
  it('says what language the board is written in', async () => {
    const fetcher = answers({ data: { translations: [{ translatedText: 'Bonjour' }] } })
    await translate('Good morning', 'fr')
    expect(JSON.parse(String(fetcher.mock.calls[0]![1].body)).source).toBe('en')
  })

  /**
   * A key on a query string ends up in logs, in browser history and in a
   * referrer. In a header it does not.
   */
  it('sends the key in a header rather than on the URL', async () => {
    const fetcher = answers({ data: { translations: [{ translatedText: 'Bonjour' }] } })
    await translate('Good morning', 'fr')
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).not.toContain(KEY)
    expect((init.headers as Record<string, string>)['X-goog-api-key']).toBe(KEY)
  })

  /**
   * **Google escapes its answer even when plain text is asked for.** That is
   * not cosmetic here: "I'm cold" comes back as `I&#39;m cold`, and a
   * synthesiser reads that out as "I ampersand hash thirty-nine m cold" — a
   * phrase somebody needed, spoken as nonsense.
   */
  it('unescapes what comes back, or a board speaks gibberish', async () => {
    answers({ data: { translations: [{ translatedText: 'J&#39;ai froid' }] } })
    expect(await translate("I'm cold", 'fr')).toEqual({ status: 'ok', text: "J'ai froid" })
  })
})

describe('unescaping', () => {
  it.each([
    ['J&#39;ai froid', "J'ai froid"],
    ['&quot;Bonjour&quot;', '"Bonjour"'],
    ['Fish &amp; chips', 'Fish & chips'],
    ['caf&#xe9;', 'café'],
    ['a &lt; b', 'a < b'],
    ['nothing to do here', 'nothing to do here'],
  ])('turns %s into %s', (raw, plain) => {
    expect(decodeEntities(raw)).toBe(plain)
  })

  // Left alone rather than guessed at: it is likelier to be something somebody
  // typed than an entity the service invented.
  it('leaves something that only looks like an entity alone', () => {
    expect(decodeEntities('AT&T and R&D')).toBe('AT&T and R&D')
    expect(decodeEntities('&notareal;')).toBe('&notareal;')
  })

  /**
   * Decoded by hand rather than through an element's `innerHTML`. This string
   * goes to a speech engine and to a clipboard, and parsing it as markup to
   * unescape it is how a board full of somebody else's phrases becomes a way of
   * running their script.
   */
  it('does not treat markup in the answer as markup', () => {
    expect(decodeEntities('&lt;img src=x onerror=alert(1)&gt;')).toBe('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
  })

  it('refuses a code point that is not a character', () => {
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;')
  })
})

describe('every way it can fail', () => {
  it('is a value, never a throw, when the network is gone', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    expect(await translate('Good morning', 'fr')).toEqual({
      status: 'error',
      error: 'Could not reach the translation service',
    })
  })

  it.each([
    [400, 'The translation key was refused — check VITE_GOOGLE_TRANSLATE_KEY reached this build'],
    [403, 'The translation key is not allowed here — check its referrer restriction covers this site, and that Cloud Translation is enabled'],
    [429, 'Too many translations at once — try again in a moment'],
    [500, 'The translation service is having trouble'],
  ])('says what %s means', async (status, error) => {
    answers({}, { status })
    expect(await translate('Good morning', 'fr')).toEqual({ status: 'error', error })
  })

  it('refuses an answer with no translation in it', async () => {
    answers({ data: { translations: [] } })
    expect((await translate('Good morning', 'fr')).status).toBe('error')
  })

  it('refuses an answer that is not JSON at all', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 200 }))
    expect((await translate('Good morning', 'fr')).status).toBe('error')
  })

  /**
   * Patois is a language the API does not have. Google Translate the product
   * added it in 2024; Cloud Translation, the one a page can call, carries
   * Haitian Creole and no other English-based creole. Asking anyway would hand back English and call
   * it a translation, which is worse than not translating at all.
   */
  it('does not go asking for a language nothing translates into', async () => {
    const fetcher = answers({ data: { translations: [{ translatedText: 'nonsense' }] } })
    expect(await translate('Help me!', 'jam')).toEqual({
      status: 'error',
      error: 'Nothing here translates into jam',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not go asking with nothing to say', async () => {
    const fetcher = answers({ data: { translations: [{ translatedText: 'Bonjour' }] } })
    expect((await translate('   ', 'fr')).status).toBe('error')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

/**
 * A build with no key in it.
 *
 * This is not a service failing, it is a deploy that went out without its
 * environment — and the only symptom on the board is a phrase quietly spoken in
 * English. So it is named separately, and it never reaches the network.
 */
describe('a build with no key', () => {
  it('says so, and does not go asking', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', '')
    const fetcher = answers({ data: { translations: [{ translatedText: 'Bonjour' }] } })
    expect(await translate('Good morning', 'fr')).toEqual({
      status: 'error',
      error: 'No translation key was built into this app',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('is what `hasTranslateKey` answers, so a caller can ask before it starts', () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', '')
    expect(hasTranslateKey()).toBe(false)
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', KEY)
    expect(hasTranslateKey()).toBe(true)
  })

  // A variable set to whitespace is a variable somebody meant to fill in.
  it('does not count a blank one as a key', () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', '   ')
    expect(hasTranslateKey()).toBe(false)
  })
})

/**
 * Every one of these paths recovers — the caller speaks the words as they were
 * written — and that is exactly what makes them invisible. A board that carries
 * on working looks like a board with nothing wrong, so the failure has to say
 * so somewhere.
 */
describe('what reaches the console', () => {
  it('warns when the service refuses', async () => {
    answers({}, { status: 403 })
    await translate('Good morning', 'fr')
    expect(warnings).toEqual([
      '[Peri] translate: The translation key is not allowed here — check its referrer restriction covers this site, and that Cloud Translation is enabled',
    ])
  })

  it('warns when the service cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    await translate('Good morning', 'fr')
    expect(warnings[0]).toContain('Could not reach the translation service')
  })

  it('names the language nothing translates into, rather than saying "that"', async () => {
    answers({ data: { translations: [] } })
    await translate('Help me!', 'jam')
    expect(warnings[0]).toContain('jam')
  })

  it('says nothing at all when it works', async () => {
    answers({ data: { translations: [{ translatedText: 'Bonjour' }] } })
    await translate('Good morning', 'fr')
    expect(warnings).toEqual([])
  })

  /**
   * **Never the words, and never the key.** A phrase belongs to the person who
   * wrote it, and a console ends up in every screen-share and bug report from
   * then on; a key in a console is a key in a screenshot.
   */
  it('never puts the phrase or the key in the console', async () => {
    answers({}, { status: 403 })
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234-secret')
    await translate('My chest hurts', 'fr')
    expect(warnings).toHaveLength(1)
    expect(warnings[0], 'a phrase reached the console').not.toContain('chest')
    expect(warnings[0], 'a key reached the console').not.toContain('key-1234-secret')
  })
})

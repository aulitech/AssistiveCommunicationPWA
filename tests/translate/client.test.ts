// Talking to DeepL.
//
// Nothing here throws. Failing to translate is not failing to speak: the caller
// says the words as they were written, and the listener gets the original
// rather than silence. Every failure is a value, exactly as in sync.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { checkKey, translate } from '../../src/translate/client'

const FREE = 'key-1234:fx'
const PRO = 'key-1234'

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
    answers({ translations: [{ text: 'Bonjour' }] })
    expect(await translate('Good morning', 'fr-FR', PRO)).toEqual({ status: 'ok', text: 'Bonjour' })
  })

  it('asks for the base language, not the region', async () => {
    const fetcher = answers({ translations: [{ text: 'Buenos días' }] })
    await translate('Good morning', 'es-MX', PRO)
    const body = JSON.parse(String(fetcher.mock.calls[0]![1].body))
    expect(body.target_lang).toBe('ES')
  })

  /**
   * The board is written in English, and saying so is both quicker and better
   * than letting six words be guessed at — "Get a doctor" is not much to go on.
   */
  it('says what language the board is written in', async () => {
    const fetcher = answers({ translations: [{ text: 'Bonjour' }] })
    await translate('Good morning', 'fr', PRO)
    expect(JSON.parse(String(fetcher.mock.calls[0]![1].body)).source_lang).toBe('EN')
  })

  // A free key ends in `:fx` and lives on a different host. Sent to the wrong
  // one it is simply refused, which reads as a bad key rather than a bad guess.
  it('goes to the free host for a free key', async () => {
    const fetcher = answers({ translations: [{ text: 'Bonjour' }] })
    await translate('Good morning', 'fr', FREE)
    expect(String(fetcher.mock.calls[0]![0])).toContain('api-free.deepl.com')

    await translate('Good morning', 'fr', PRO)
    expect(String(fetcher.mock.calls[1]![0])).toContain('api.deepl.com')
  })
})

describe('every way it can fail', () => {
  it('is a value, never a throw, when the network is gone', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    expect(await translate('Good morning', 'fr', PRO)).toEqual({
      status: 'error',
      error: 'Could not reach the translation service',
    })
  })

  it.each([
    [403, 'That translation key was refused'],
    [429, 'Too many translations at once — try again in a moment'],
    [456, 'This month’s translation quota is used up'],
    [500, 'The translation service is having trouble'],
  ])('says what %s means', async (status, error) => {
    answers({}, { status })
    expect(await translate('Good morning', 'fr', PRO)).toEqual({ status: 'error', error })
  })

  it('refuses an answer with no translation in it', async () => {
    answers({ translations: [] })
    expect((await translate('Good morning', 'fr', PRO)).status).toBe('error')
  })

  it('refuses an answer that is not JSON at all', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 200 }))
    expect((await translate('Good morning', 'fr', PRO)).status).toBe('error')
  })

  it('does not go asking with no key, or with nothing to say', async () => {
    const fetcher = answers({ translations: [{ text: 'Bonjour' }] })
    expect((await translate('Good morning', 'fr', '')).status).toBe('error')
    expect((await translate('   ', 'fr', PRO)).status).toBe('error')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

/**
 * A key is checked by using it, which is the only honest test of one. A key
 * that cannot translate a single word is a key that would fail silently later,
 * in the middle of a sentence somebody needed.
 */
describe('checking a key', () => {
  it('accepts one that works', async () => {
    answers({ translations: [{ text: 'Hallo' }] })
    expect(await checkKey(PRO)).toEqual({ ok: true })
  })

  it('reports why one does not', async () => {
    answers({}, { status: 403 })
    expect(await checkKey('nonsense')).toEqual({ ok: false, error: 'That translation key was refused' })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  REMOTE_PREFIX,
  linkAccount,
  remoteVoiceId,
  remoteVoiceURI,
  synthesize,
} from '../../src/voice/elevenlabs'
import { cachedCount, clearAudioCache } from '../../src/voice/audio-cache'
import { type ElevenLabsAccount } from '../../src/core/store'

const ACCOUNT: ElevenLabsAccount = { apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }

const respondWith = (body: unknown, init: { status?: number; blob?: boolean } = {}) =>
  vi.fn(async () => ({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
    blob: async () => new Blob(['audio']),
  })) as unknown as typeof fetch

beforeEach(() => {
  clearAudioCache()
})

describe('naming a voice', () => {
  it('tells an account voice from a device one', () => {
    expect(remoteVoiceURI('abc')).toBe(`${REMOTE_PREFIX}abc`)
    expect(remoteVoiceId(remoteVoiceURI('abc'))).toBe('abc')
    // A device voiceURI is a URI and can contain anything; it is never a match.
    expect(remoteVoiceId('urn:moz-tts:speechd:English')).toBeNull()
    expect(remoteVoiceId('')).toBeNull()
  })
})

describe('linking an account', () => {
  it('takes the voices behind a working key', async () => {
    vi.stubGlobal('fetch', respondWith({ voices: [{ voice_id: 'v1', name: 'Rachel' }] }))
    const result = await linkAccount('  sk-test  ')
    expect(result).toEqual({ ok: true, account: { apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] } })
  })

  it('sends the key as a header, never in the URL', async () => {
    const fetcher = respondWith({ voices: [{ voice_id: 'v1', name: 'Rachel' }] })
    vi.stubGlobal('fetch', fetcher)
    await linkAccount('sk-secret')

    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).not.toContain('sk-secret')
    expect(init.headers['xi-api-key']).toBe('sk-secret')
  })

  // Each of these is something the person linking can act on, which a status
  // code is not.
  it.each([
    [401, /not accepted/i],
    [403, /not accepted/i],
    [429, /fewer requests/i],
    [500, /error \(500\)/i],
  ])('says what to do about a %i', async (status, expected) => {
    vi.stubGlobal('fetch', respondWith({}, { status }))
    const result = await linkAccount('sk-test')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(expected)
  })

  it('says so plainly when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const result = await linkAccount('sk-test')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/could not reach/i)
  })

  it('asks for a key before making a request at all', async () => {
    const fetcher = respondWith({})
    vi.stubGlobal('fetch', fetcher)
    const result = await linkAccount('   ')
    expect(result.ok).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  // Linking to nothing would put a voice picker on screen with nothing in it.
  it('refuses an account with no voices in it', async () => {
    vi.stubGlobal('fetch', respondWith({ voices: [] }))
    const result = await linkAccount('sk-test')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/no voices/i)
  })

  it('drops entries it cannot read rather than the whole reply', async () => {
    vi.stubGlobal('fetch', respondWith({
      voices: [{ voice_id: 'v1', name: 'Rachel' }, { name: 'no id' }, { voice_id: 'v2' }, 'nonsense'],
    }))
    const result = await linkAccount('sk-test')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.account.voices).toEqual([{ id: 'v1', name: 'Rachel' }])
  })
})

describe('fetching audio', () => {
  it('asks for the chosen voice and hands back what came', async () => {
    const fetcher = respondWith(null)
    vi.stubGlobal('fetch', fetcher)
    const blob = await synthesize(ACCOUNT, 'v1', 'Hello')

    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/text-to-speech/v1')
    expect(JSON.parse(init.body).text).toBe('Hello')
    expect(blob).toBeInstanceOf(Blob)
  })

  // An AAC board is the same phrases over and over. The second time has to be
  // free and instant, or a day's talking is a day's billing.
  it('keeps what it fetched and does not pay for it twice', async () => {
    const fetcher = respondWith(null)
    vi.stubGlobal('fetch', fetcher)

    const first = await synthesize(ACCOUNT, 'v1', 'Hello')
    const second = await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(second).toBe(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the same words in different voices apart', async () => {
    const fetcher = respondWith(null)
    vi.stubGlobal('fetch', fetcher)
    await synthesize(ACCOUNT, 'v1', 'Hello')
    await synthesize(ACCOUNT, 'v2', 'Hello')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('forgets everything when an account is unlinked', async () => {
    vi.stubGlobal('fetch', respondWith(null))
    await synthesize(ACCOUNT, 'v1', 'Hello')
    expect(cachedCount()).toBe(1)
    clearAudioCache()
    expect(cachedCount()).toBe(0)
  })

  // Unbounded, a day of talking would hold every phrase's audio in memory.
  it('does not grow without limit', async () => {
    vi.stubGlobal('fetch', respondWith(null))
    for (let i = 0; i < 260; i++) await synthesize(ACCOUNT, 'v1', `phrase ${i}`)
    expect(cachedCount()).toBeLessThanOrEqual(200)
  })

  it('throws with a reason the caller can show', async () => {
    vi.stubGlobal('fetch', respondWith({}, { status: 401 }))
    await expect(synthesize(ACCOUNT, 'v1', 'Hello')).rejects.toThrow(/not accepted/i)
  })
})

describe('asking for the same clip twice at once', () => {
  // Previewing a voice and then assigning it asks for the same words within a
  // moment, and the cache cannot dedupe what has not come back yet.
  it('shares one request rather than paying for two', async () => {
    let resolve: (v: unknown) => void = () => {}
    const fetcher = vi.fn(
      () => new Promise(r => {
        resolve = r
      }),
    )
    vi.stubGlobal('fetch', fetcher)

    const first = synthesize(ACCOUNT, 'v1', 'Hello')
    const second = synthesize(ACCOUNT, 'v1', 'Hello')
    resolve({ ok: true, status: 200, blob: async () => new Blob(['audio']) })

    expect(await first).toBe(await second)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('asks again once the first has finished and failed', async () => {
    vi.stubGlobal('fetch', respondWith({}, { status: 500 }))
    await expect(synthesize(ACCOUNT, 'v1', 'Hello')).rejects.toThrow()

    vi.stubGlobal('fetch', respondWith(null))
    await expect(synthesize(ACCOUNT, 'v1', 'Hello')).resolves.toBeInstanceOf(Blob)
  })
})

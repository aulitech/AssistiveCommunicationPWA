import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { REMOTE_PREFIX, linkAccount, remoteVoiceId, remoteVoiceURI, synthesize } from '../../src/voice/elevenlabs'
import {
  audioKey,
  cachedAudio,
  cachedCount,
  clearAudioCache,
  rememberAudio,
  setRemoteClips,
  storedAudio,
  warmAudio,
} from '../../src/voice/audio-cache'
import { clips, databases, installFakeIdb, removeFakeIdb, seedClip } from './fake-idb'
import { openBoardFor, type ElevenLabsAccount, type User } from '../../src/core/store'

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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
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
    vi.stubGlobal(
      'fetch',
      respondWith({
        voices: [{ voice_id: 'v1', name: 'Rachel' }, { name: 'no id' }, { voice_id: 'v2' }, 'nonsense'],
      }),
    )
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
      () =>
        new Promise(r => {
          resolve = r
        }),
    )
    vi.stubGlobal('fetch', fetcher)

    const first = synthesize(ACCOUNT, 'v1', 'Hello')
    const second = synthesize(ACCOUNT, 'v1', 'Hello')
    // The request no longer goes out in the same tick: the stored layer and the
    // server are both asked ahead of it, and both answer with a promise. The
    // sharing is unaffected — `inFlight` is written before any of that.
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
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

/**
 * The whole point of the four layers: a clip is billed per character, so the
 * network is the last place asked and only a genuine miss reaches it.
 */
describe('everywhere a clip may already be', () => {
  const KEY = audioKey('v1', 'Hello')

  beforeEach(() => {
    installFakeIdb()
    setRemoteClips(null)
  })
  afterEach(() => {
    removeFakeIdb()
    setRemoteClips(null)
  })

  /**
   * The one this was built for. Every clip fetched has always been written to
   * IndexedDB, and nothing ever read it back except the handful of phrases
   * carrying their own voice — so a reload bought the whole board again, one
   * phrase at a time, with the audio already sitting there unread.
   */
  it('reads a clip from an earlier session rather than buying it again', async () => {
    seedClip(KEY, new Blob(['stored']))
    const fetcher = respondWith(null)
    vi.stubGlobal('fetch', fetcher)

    const blob = await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(await blob.text()).toBe('stored')
    expect(fetcher).not.toHaveBeenCalled()
  })

  // Reading the disk is not free, and a board says the same phrase all day.
  it('keeps what it read off the disk in memory', async () => {
    seedClip(KEY, new Blob(['stored']))
    vi.stubGlobal('fetch', respondWith(null))

    await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(cachedCount()).toBe(1)
  })

  /**
   * The emergency bar asks `cachedAudio`, which is synchronous and looks only in
   * memory — so a phrase given its own voice is in memory after a reload or it
   * is not in the right voice at all. `warmAudio` is what puts it there, and it
   * reads through the same stored layer.
   */
  it('warms a phrase with its own voice back into memory', async () => {
    seedClip(KEY, new Blob(['stored']))

    expect(await warmAudio([KEY])).toBe(1)
    expect(await cachedAudio(KEY)?.text()).toBe('stored')
  })

  it('asks the other devices when this one has never had it', async () => {
    const get = vi.fn(async () => new Blob(['from the tablet']))
    const put = vi.fn()
    setRemoteClips({ get, put })
    const fetcher = respondWith(null)
    vi.stubGlobal('fetch', fetcher)

    const blob = await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(await blob.text()).toBe('from the tablet')
    expect(get).toHaveBeenCalledWith(KEY)
    expect(fetcher).not.toHaveBeenCalled()
  })

  // Otherwise every phrase said after a reload would be a request to the server
  // for something this device already has on disk.
  it('asks its own disk before it asks the server', async () => {
    seedClip(KEY, new Blob(['stored']))
    const get = vi.fn(async () => null)
    setRemoteClips({ get, put: vi.fn() })
    vi.stubGlobal('fetch', respondWith(null))

    await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(get).not.toHaveBeenCalled()
  })

  // A clip that came off the server is kept in both layers here too, or the next
  // reload would go and ask for it all over again.
  it('keeps what the other devices had, on disk as well as in memory', async () => {
    setRemoteClips({ get: async () => new Blob(['shared']), put: vi.fn() })
    vi.stubGlobal('fetch', respondWith(null))

    await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(cachedCount()).toBe(1)
    expect(await clips.get(KEY)?.text()).toBe('shared')
  })

  it('offers what it bought to the other devices', async () => {
    const put = vi.fn()
    setRemoteClips({ get: async () => null, put })
    vi.stubGlobal('fetch', respondWith(null))

    const blob = await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(put).toHaveBeenCalledWith(KEY, blob)
  })

  // It came from there. Sending it back is a write nobody needs.
  it('does not offer back what the server already had', async () => {
    const put = vi.fn()
    setRemoteClips({ get: async () => new Blob(['shared']), put })
    vi.stubGlobal('fetch', respondWith(null))

    await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(put).not.toHaveBeenCalled()
  })

  it('buys it when neither this device nor the others have it', async () => {
    setRemoteClips({ get: async () => null, put: vi.fn() })
    const fetcher = respondWith(null)
    vi.stubGlobal('fetch', fetcher)

    await synthesize(ACCOUNT, 'v1', 'Hello')

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  // Synchronizing is off in the app as it ships, and a board still has to speak.
  it('buys it when there is no server at all', async () => {
    const fetcher = respondWith(null)
    vi.stubGlobal('fetch', fetcher)

    await expect(synthesize(ACCOUNT, 'v1', 'Hello')).resolves.toBeInstanceOf(Blob)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  // A refused database is the private-window case, and it must cost a clip
  // rather than a phrase.
  it('buys it when the database cannot be opened', async () => {
    removeFakeIdb()
    const fetcher = respondWith(null)
    vi.stubGlobal('fetch', fetcher)

    await expect(synthesize(ACCOUNT, 'v1', 'Hello')).resolves.toBeInstanceOf(Blob)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

/**
 * A clip is keyed by the words it says, so the audio made for a board is a list
 * of that board's phrases. Each board keeps its own, in a database of its own —
 * `clips` is the first owner's, which keeps the name every release before this
 * used — and a factory reset reaches only the board being reset.
 */
describe('whose audio it is', () => {
  const KEY = audioKey('v1', 'Hello')
  const ada: User = { name: 'Ada', email: '', provider: 'google', sub: '1' }
  const bob: User = { name: 'Bob', email: '', provider: 'google', sub: '2' }
  /** The fake answers on microtasks; a macrotask is past all of them. */
  const written = () => new Promise(resolve => setTimeout(resolve, 0))

  beforeEach(() => installFakeIdb())
  afterEach(() => removeFakeIdb())

  it('is found only on the board it was made for', async () => {
    openBoardFor(ada)
    seedClip(KEY, new Blob(['Ada']))
    openBoardFor(bob)
    expect(await storedAudio(KEY), 'a second account found the first one’s audio').toBeUndefined()

    rememberAudio(KEY, new Blob(['Bob']))
    await written()
    expect(await clips.get(KEY)?.text(), 'the second account’s clip went into the first one’s database').toBe(
      'Ada',
    )
    expect(databases.size).toBe(2)
  })

  it('is cleared only on the board being reset', async () => {
    openBoardFor(ada)
    seedClip(KEY, new Blob(['Ada']))
    openBoardFor(bob)
    rememberAudio(KEY, new Blob(['Bob']))
    await written()

    clearAudioCache()
    await written()
    expect(await storedAudio(KEY)).toBeUndefined()
    openBoardFor(ada)
    expect(await (await storedAudio(KEY))?.text(), 'resetting one board took another’s audio').toBe('Ada')
  })
})

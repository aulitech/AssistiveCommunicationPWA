import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hasReplyKey, suggestReply } from '../../src/listen/suggest'
import { DEFAULT_REPLY_MODEL, saveReplyKey } from '../../src/core/store'
import { warnings } from '../setup'

// A suggested answer to a question that was heard.
//
// **The riskiest thing in this app**, and these tests are arranged around that
// rather than around the HTTP. A machine offering words for somebody to say is
// one step from a machine deciding what they meant, so what is asserted here is
// the shape of the request, every way it can fail without costing anything, and
// that nothing it touches ever reaches a speaker.

const KEY = 'sk-ant-test-1234'

const replies = (text: string) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )

const refuses = (status: number) => vi.fn(async () => new Response(JSON.stringify({ error: {} }), { status }))

/** The body of the one request that went out. */
const sent = (fetcher: ReturnType<typeof vi.fn>) =>
  JSON.parse(String((fetcher.mock.calls as unknown as [string, RequestInit][])[0][1].body)) as {
    model: string
    max_tokens: number
    system: string
    tools: { type: string; name: string; max_uses: number }[]
    messages: { role: string; content: string }[]
  }

const headers = (fetcher: ReturnType<typeof vi.fn>) =>
  ((fetcher.mock.calls as unknown as [string, RequestInit][])[0][1].headers ?? {}) as Record<string, string>

beforeEach(() => {
  localStorage.clear()
  saveReplyKey(KEY)
})

describe('whether it is set up at all', () => {
  it('says no before a key has been given', () => {
    localStorage.clear()
    expect(hasReplyKey()).toBe(false)
  })

  it('says yes once one has', () => {
    expect(hasReplyKey()).toBe(true)
  })
})

describe('asking for a reply', () => {
  it('hands back what came', async () => {
    vi.stubGlobal('fetch', replies('Tea please'))
    await expect(suggestReply('Do you want tea or coffee?', '')).resolves.toEqual({
      status: 'ok',
      text: 'Tea please',
    })
  })

  it('sends the question, and the key in a header', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Do you want tea or coffee?', '')

    expect(sent(fetcher).messages[0].content).toContain('Do you want tea or coffee?')
    // In a header rather than on the query string, for the reason every key in
    // this app is: a key in a URL ends up in logs, in history and in a referrer.
    expect(headers(fetcher)['x-api-key']).toBe(KEY)

    // And in that one place only. A key copied into a second header or onto the
    // URL is a key in somewhere nobody thought to look at.
    const [url, init] = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]
    expect(String(url)).not.toContain(KEY)
    expect(String(init.body)).not.toContain(KEY)
    expect(Object.values(headers(fetcher)).filter(v => String(v).includes(KEY))).toHaveLength(1)
  })

  // Anthropic refuses a browser request without it.
  it('says it is coming from a browser on purpose', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Do you want tea?', '')
    expect(headers(fetcher)['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  /**
   * Fast over clever where nothing has been chosen, the way the ElevenLabs model
   * is chosen: this is somebody mid-conversation with a person waiting in front
   * of them, and a better sentence that arrives ten seconds later is not a
   * better sentence.
   */
  it('asks a fast model for something short', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Do you want tea?', '')

    expect(sent(fetcher).model).toBe(DEFAULT_REPLY_MODEL)
    expect(sent(fetcher).max_tokens).toBeLessThanOrEqual(400)
  })

  it('asks the model that was chosen in Settings', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Do you want tea?', '', 'claude-opus-5')
    expect(sent(fetcher).model).toBe('claude-opus-5')
  })

  /**
   * Held to the list here as well as where it is stored. This is the last point
   * before it becomes somebody else's API call, and a name that is not one would
   * fail on the question rather than on the setting — which is the difference
   * between a board that answers badly and a board that will not answer.
   */
  it('falls back rather than asking for a model it cannot call', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Do you want tea?', '', 'some-model-from-later')
    expect(sent(fetcher).model).toBe(DEFAULT_REPLY_MODEL)
  })

  /**
   * **The world it may answer for, the person it may not.** The guard used to be
   * written as facts in general, which a model reads as covering the capital of
   * France — so it dodged questions nobody could come to harm over and the whole
   * thing read as broken rather than careful.
   */
  it('tells it which facts are not its to state', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Did you take your tablets?', '')

    const brief = sent(fetcher).system
    expect(brief, 'the world is not off limits').toMatch(/question about the world you may answer/i)
    expect(brief, 'the person is').toMatch(/never state what they did/i)
  })

  /**
   * The one capability here that costs time somebody is standing in front of
   * them for, so it is bounded hard: the model decides whether to search at all,
   * and may do it once.
   */
  it('offers it one search, and no more', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Who won last night?', '')

    const tools = sent(fetcher).tools
    expect(tools).toHaveLength(1)
    expect(tools[0].type).toMatch(/^web_search/)
    expect(tools[0].max_uses).toBe(1)
  })

  /**
   * The limits the brief puts on it, which are the whole of the safety argument:
   * one short reply, in the first person, and **nothing invented about a person
   * it knows nothing about.** A board answering "yes, I took them at eight" to a
   * question about medication would be putting a clinical claim in somebody's
   * mouth.
   */
  it('tells the model what it may not do', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Did you take your tablets?', '')

    const brief = sent(fetcher).system
    expect(brief).toMatch(/first person/i)
    expect(brief).toMatch(/never state what they did/i)
    expect(brief).toMatch(/at most two sentences/i)
  })

  /**
   * A bare API call carries no clock. Without the date, every question with a
   * *when* in it was answered out of a model's training data as though the year
   * had not moved — which reads as the thing being wrong rather than limited.
   */
  it('tells it what day it is', async () => {
    const fetcher = replies('Tuesday')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('What day is it?', '')

    const stamp = new Date().toLocaleDateString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    expect(sent(fetcher).system).toContain(stamp)
  })

  // The suggestion is going into the message box to be read by the person who
  // would have to say it, and everything else they read is in their language.
  it('asks for the reply in the board’s own language', async () => {
    const fetcher = replies('Té por favor')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('¿Quieres té o café?', 'es-PR')
    expect(sent(fetcher).system).toContain('es-PR')
  })

  it('says nothing about a language when the board has none', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Do you want tea?', '')
    expect(sent(fetcher).system).not.toMatch(/Write the reply in/)
  })

  /**
   * A turn with a search in it holds several blocks: whatever the model said
   * before it looked anything up, the search, what came back, and then the
   * answer. **Only the last of those is the reply.** Joining them all would put
   * "let me look that up" into the message box in front of the words.
   */
  it('takes the answer after a search, and not the thinking aloud before it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              content: [
                { type: 'text', text: 'Let me look that up for you.' },
                { type: 'server_tool_use', name: 'web_search', input: { query: 'who won last night' } },
                { type: 'web_search_tool_result', content: [{ title: 'Result', url: 'https://example.test' }] },
                { type: 'text', text: 'City won, two one.' },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
    await expect(suggestReply('Who won last night?', '')).resolves.toEqual({
      status: 'ok',
      text: 'City won, two one.',
    })
  })

  it('says so when a search came back and the model said nothing after it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              content: [
                { type: 'text', text: 'Let me look that up.' },
                { type: 'web_search_tool_result', content: [] },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
    const result = await suggestReply('Who won last night?', '')
    expect(result.status).toBe('error')
  })

  /**
   * **Only the parts that are the reply.** A block of some other kind carrying a
   * `text` field is the case this guards: a model's own working, put into an
   * assistive board's message box for somebody to say out loud, would be the
   * worst thing this feature could do.
   */
  it('joins a reply that came back in pieces, and takes nothing that is not it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              content: [
                { type: 'thinking', text: 'They probably want tea, but' },
                { type: 'text', text: 'Tea ' },
                { type: 'text', text: 'please' },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
    await expect(suggestReply('Tea or coffee?', '')).resolves.toEqual({ status: 'ok', text: 'Tea please' })
  })
})

/**
 * Every one of these is a value rather than a throw, and every one of them costs
 * a suggestion and nothing else. The message box is left exactly as it was.
 */
describe('when it does not work', () => {
  it('refuses to ask with no key', async () => {
    localStorage.clear()
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)

    const result = await suggestReply('Tea or coffee?', '')

    expect(result).toEqual({ status: 'error', error: expect.stringMatching(/Settings/) })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses to ask about nothing', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)

    const result = await suggestReply('   ', '')

    expect(result.status).toBe('error')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('names a key that was not accepted, and where to fix it', async () => {
    vi.stubGlobal('fetch', refuses(401))
    const result = await suggestReply('Tea or coffee?', '')
    expect(result).toEqual({ status: 'error', error: expect.stringMatching(/Settings/) })
  })

  it('names the rest of what a service can say', async () => {
    for (const [status, said] of [
      [403, /not allowed/i],
      [429, /too many/i],
      [500, /having trouble/i],
      [418, /said 418/i],
    ] as [number, RegExp][]) {
      vi.stubGlobal('fetch', refuses(status))
      const result = await suggestReply('Tea or coffee?', '')
      expect(result.status === 'error' && result.error, String(status)).toMatch(said)
    }
  })

  it('says so when the service cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    await expect(suggestReply('Tea or coffee?', '')).resolves.toEqual({
      status: 'error',
      error: expect.stringMatching(/could not reach/i),
    })
  })

  /**
   * Read rather than trusted, like everything else that comes off a wire here.
   * A block whose words are not words would otherwise be stringified into the
   * message box, and `[object Object]` is a thing somebody would then be
   * offered to say out loud.
   */
  it('takes nothing out of a block whose words are not words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ content: [{ type: 'text', text: { parts: ['Tea', 'please'] } }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const result = await suggestReply('Tea or coffee?', '')
    expect(result.status).toBe('error')
  })

  it('says so when nothing came back to say', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ content: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const result = await suggestReply('Tea or coffee?', '')
    expect(result.status).toBe('error')
  })

  it('says so when the answer is not JSON at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200 })),
    )
    const result = await suggestReply('Tea or coffee?', '')
    expect(result.status).toBe('error')
  })

  it('never throws, whatever comes back', async () => {
    for (const stub of [
      () => Promise.reject(new Error('boom')),
      vi.fn(async () => new Response('nonsense', { status: 200 })),
      refuses(500),
    ]) {
      vi.stubGlobal('fetch', stub)
      await expect(suggestReply('Tea or coffee?', '')).resolves.toHaveProperty('status')
    }
  })
})

/**
 * The rule every failure in this app follows: **never the words, and never the
 * key.** A console ends up in every screen-share and bug report from then on.
 */
describe('what reaches the console', () => {
  it('names the operation and the failure, and neither the question nor the key', async () => {
    vi.stubGlobal('fetch', refuses(401))
    await suggestReply('Did you take your tablets?', '')

    const said = warnings.join(' ')
    expect(said).toMatch(/suggest/)
    expect(said).not.toContain('tablets')
    expect(said).not.toContain(KEY)
  })

  it('says nothing about the reply it was given either', async () => {
    vi.stubGlobal('fetch', replies('Yes, at eight this morning'))
    await suggestReply('Did you take your tablets?', '')
    expect(warnings.join(' ')).not.toMatch(/eight this morning/)
  })
})

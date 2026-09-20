import { describe, it, expect, beforeEach, vi } from 'vitest'
import { boardForReply, hasReplyKey, suggestReply } from '../../src/listen/suggest'
import { DEFAULT_REPLY_MODEL, saveReplyKey } from '../../src/core/store'
import { makePhrase } from '../../src/core/phrases'
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
type SystemBlock = { type: string; text: string; cache_control?: { type: string; ttl?: string } }

const sent = (fetcher: ReturnType<typeof vi.fn>) =>
  JSON.parse(String((fetcher.mock.calls as unknown as [string, RequestInit][])[0][1].body)) as {
    model: string
    max_tokens: number
    system: SystemBlock[]
    tools: { type: string; name: string; max_uses: number }[]
    messages: { role: string; content: string }[]
  }

/** Everything the model was told before the conversation, as one piece of text. */
const brief = (fetcher: ReturnType<typeof vi.fn>) =>
  sent(fetcher)
    .system.map(block => block.text)
    .join(' ')

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

describe('asking for answers', () => {
  it('hands back what came, a line an answer', async () => {
    vi.stubGlobal('fetch', replies('Tea please\nCoffee please\nNeither, thank you'))
    await expect(suggestReply('Do you want tea or coffee?', '')).resolves.toEqual({
      status: 'ok',
      replies: ['Tea please', 'Coffee please', 'Neither, thank you'],
    })
  })

  /**
   * **A format a model cannot half-follow.** No JSON to be truncated, no beta
   * header, and a line that came back wearing a number costs its number rather
   * than the whole list — a board saying "1." out loud is what this is for.
   */
  it('takes the numbering, the bullets and the quotation marks off', async () => {
    vi.stubGlobal('fetch', replies('1. Tea please\n2) Coffee please\n- Neither\n• Water\n"Yes please"'))
    const result = await suggestReply('Tea or coffee?', '')
    expect(result).toEqual({
      status: 'ok',
      replies: ['Tea please', 'Coffee please', 'Neither', 'Water', 'Yes please'],
    })
  })

  it('drops the blank lines a list comes with', async () => {
    vi.stubGlobal('fetch', replies('Tea please\n\n   \nCoffee please\n'))
    const result = await suggestReply('Tea or coffee?', '')
    expect(result).toEqual({ status: 'ok', replies: ['Tea please', 'Coffee please'] })
  })

  // A second cell saying what the first says is a target spent for nothing.
  it('draws the same answer once, whatever case it came in', async () => {
    vi.stubGlobal('fetch', replies('Tea please\ntea please\nCoffee please'))
    const result = await suggestReply('Tea or coffee?', '')
    expect(result).toEqual({ status: 'ok', replies: ['Tea please', 'Coffee please'] })
  })

  /**
   * Twenty cells is a screen somebody can read by gaze. The twenty-first is one
   * nobody ever reaches, and the ones past it push the good answers off the
   * fold — so the cap is here as well as on the brief, which is a request.
   */
  it('takes twenty at the outside, however many came', async () => {
    vi.stubGlobal('fetch', replies([...Array(40)].map((_, i) => `Answer ${i}`).join('\n')))
    const result = await suggestReply('What now?', '')
    expect(result.status === 'ok' && result.replies).toHaveLength(20)
    expect(result.status === 'ok' && result.replies[19]).toBe('Answer 19')
  })

  // One is a perfectly good answer to some questions, and it is a list either
  // way — there is nothing else for the board to draw.
  it('hands back one where one is all that came', async () => {
    vi.stubGlobal('fetch', replies('Tea please'))
    await expect(suggestReply('Do you want tea?', '')).resolves.toEqual({
      status: 'ok',
      replies: ['Tea please'],
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
    // Twenty short answers and a search query, and no room for an essay.
    expect(sent(fetcher).max_tokens).toBeLessThanOrEqual(1200)
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

    const told = brief(fetcher)
    expect(told, 'the world is not off limits').toMatch(/question about the world you may answer/i)
    expect(told, 'the person is').toMatch(/never state what they did/i)
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

    const told = brief(fetcher)
    expect(told).toMatch(/first person/i)
    expect(told).toMatch(/never state what they did/i)
    expect(told).toMatch(/at most two sentences/i)
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
    expect(brief(fetcher)).toContain(stamp)
  })

  // The suggestion is going into the message box to be read by the person who
  // would have to say it, and everything else they read is in their language.
  it('asks for the reply in the board’s own language', async () => {
    const fetcher = replies('Té por favor')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('¿Quieres té o café?', 'es-PR')
    expect(brief(fetcher)).toContain('es-PR')
  })

  it('says nothing about a language when the board has none', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Do you want tea?', '')
    expect(brief(fetcher)).not.toMatch(/Write the reply in/)
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
      replies: ['City won, two one.'],
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
   * **Only the parts that are the answers.** A block of some other kind carrying
   * a `text` field is the case this guards: a model's own working, drawn on an
   * assistive board for somebody to say out loud, would be the worst thing this
   * feature could do.
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
    await expect(suggestReply('Tea or coffee?', '')).resolves.toEqual({
      status: 'ok',
      replies: ['Tea please'],
    })
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

/**
 * A gap, not a question back.
 *
 * What the model may not state about the person it leaves a hole in, which
 * becomes a blank in the cell it is drawn on — see `tests/talk/suggestions`,
 * where the hole is opened out and the caret goes into it. Asking "which
 * tablets?" would be a machine interviewing somebody who is already having to
 * spell their answers out one letter at a time.
 */
describe('a gap where a fact would go', () => {
  beforeEach(() => saveReplyKey(KEY))

  it('asks the model for a gap rather than a question back', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Did you take your tablets?', '')

    const told = brief(fetcher)
    expect(told).toMatch(/gap where the fact goes/i)
    expect(told).toMatch(/never ask them a question back/i)
  })

  /**
   * **Real answers beat a gap.** A question with a handful of answers is what
   * twenty cells are for, and a single line with a hole in it asks somebody who
   * spells at one letter a dwell to do the work the model could have done.
   */
  it('asks for the answers themselves where a question has them', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Tea or coffee?', '')
    expect(brief(fetcher)).toMatch(/give each its own line rather than one line with a gap/i)
  })

  // Handed back as the model wrote it. Opening the gap out is the board's
  // business, because the board is where the caret has to land in it.
  it('hands the gap back as it came', async () => {
    vi.stubGlobal('fetch', replies('I took them at ___ this morning'))
    const result = await suggestReply('When did you take them?', '')
    expect(result).toEqual({ status: 'ok', replies: ['I took them at ___ this morning'] })
  })
})

/**
 * Today's conversation.
 *
 * "Tea or coffee?" followed by "milk?" is one exchange, and a reply to the
 * second that had never seen the first would be answering a different question.
 */
describe('what was asked before', () => {
  beforeEach(() => saveReplyKey(KEY))

  const earlier = (at: number, question: string, reply: string) => ({ at, question, reply })

  it('goes back as the turns it was', async () => {
    const fetcher = replies('Yes please')
    vi.stubGlobal('fetch', fetcher)

    await suggestReply('Milk?', '', undefined, [earlier(1, 'Tea or coffee?', 'Tea please')])

    expect(sent(fetcher).messages).toEqual([
      { role: 'user', content: 'Someone just asked me: Tea or coffee?' },
      { role: 'assistant', content: 'Tea please' },
      { role: 'user', content: 'Someone just asked me: Milk?' },
    ])
  })

  it('sends only the question where there is nothing before it', async () => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    await suggestReply('Tea or coffee?', '')
    expect(sent(fetcher).messages).toHaveLength(1)
  })

  it('keeps them in the order they happened', async () => {
    const fetcher = replies('Yes')
    vi.stubGlobal('fetch', fetcher)

    await suggestReply('And sugar?', '', undefined, [
      earlier(1, 'Tea or coffee?', 'Tea please'),
      earlier(2, 'Milk?', 'Yes please'),
    ])

    expect(sent(fetcher).messages.map(m => m.content)).toEqual([
      'Someone just asked me: Tea or coffee?',
      'Tea please',
      'Someone just asked me: Milk?',
      'Yes please',
      'Someone just asked me: And sugar?',
    ])
  })
})

/**
 * **Their own words first.** Every phrase on the board goes with the question,
 * and a reply that is one of them is in words the person chose, on a board they
 * already know how to read.
 */
describe('the phrases on the board', () => {
  const BOARD = ['Tea please', 'No thank you', 'I would like ___']
  const ask = (language = '', board = BOARD) => {
    const fetcher = replies('Tea please')
    vi.stubGlobal('fetch', fetcher)
    return suggestReply('Tea or coffee?', language, undefined, [], board).then(() => fetcher)
  }
  const boardBlock = (fetcher: ReturnType<typeof vi.fn>) => sent(fetcher).system.find(b => b.cache_control)

  it('gives it every one of them, a line each', async () => {
    const block = boardBlock(await ask())
    expect(block?.text).toContain('\nTea please\nNo thank you\nI would like ___')
  })

  it('tells it to offer them first, word for word, wherever they answer', async () => {
    const told = brief(await ask())
    expect(told).toMatch(/exactly as it is written, gaps included/i)
    expect(told, 'their own phrases are not put first').toMatch(/first, ahead of anything you write/i)
    expect(told).toMatch(/write new ones to fill out the list/i)
  })

  /**
   * **What they can say, not what is true of them.** The rule about whose facts
   * lets the model state what "is in what you were sent", and a board holding
   * "I have taken my tablets" was sent — so without this line the board would be
   * read as the very evidence the rule exists to withhold.
   */
  it('tells it the phrases are not facts about them', async () => {
    expect(brief(await ask())).toMatch(/what they are able to say, not facts about them/i)
  })

  /**
   * Thirteen thousand tokens, the same from one question to the next. **Nothing
   * that changes between questions may sit in the cached block or before it** —
   * the date least of all, which would write the board again every morning and
   * look like a cache that simply never works.
   */
  it('marks the board for an hour’s caching, with nothing that changes ahead of it', async () => {
    const fetcher = await ask()
    const { system } = sent(fetcher)
    const at = system.findIndex(b => b.cache_control)

    expect(system[at].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(
      system.filter(b => b.cache_control),
      'one mark, on the board',
    ).toHaveLength(1)

    const stamp = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const cached = system
      .slice(0, at + 1)
      .map(b => b.text)
      .join(' ')
    expect(cached, 'the date is inside the cached part').not.toContain(stamp)
    expect(cached, 'the question is inside the cached part').not.toContain('Tea or coffee?')
    expect(
      system
        .slice(at + 1)
        .map(b => b.text)
        .join(' '),
    ).toContain(stamp)
  })

  it('asks for no caching and says nothing about a board when there is none', async () => {
    const fetcher = await ask('', [])
    expect(boardBlock(fetcher)).toBeUndefined()
    expect(brief(fetcher)).not.toMatch(/phrases on their board/i)
  })

  // The board is in the words it was written in; a reply asked for in another
  // language must still be allowed to be one of them.
  it('lets a reply in another language be a phrase off the board', async () => {
    expect(brief(await ask('es-PR'))).toMatch(/Write the reply in es-PR, translating a phrase from their board/)
    expect(brief(await ask('es-PR', []))).toMatch(/Write the reply in es-PR\./)
  })
})

describe('the board as the model is given it', () => {
  const lines = (...sources: string[]) => boardForReply(sources.map(source => makePhrase(source, 'Test')))

  /**
   * **A choice is a gap.** Which of them is theirs to say, and it is usually the
   * very fact the model is kept from stating — "I want the red one" is a want.
   * Written the way a gap in a reply is written, so a phrase chosen off the
   * board lands with the caret in it, as one chosen off the grid does.
   */
  it('writes a slot with a choice in it as a gap', () => {
    expect(lines("I want the {['red', 'blue']} one")).toEqual(['I want the ___ one'])
  })

  it('writes a slot with nothing in it as a gap', () => {
    expect(lines('I need to see the doctor for {nosuchlist}.')).toEqual(['I need to see the doctor for ___.'])
  })

  // One option is how the board reads it: the word, with no choosing to do.
  it('writes a slot with one option as that word', () => {
    expect(lines("A cup of {['tea']}, please")).toEqual(['A cup of tea, please'])
  })

  it('takes the markup off, as speech does', () => {
    expect(lines('**Help** me with _this_')).toEqual(['Help me with this'])
  })

  /**
   * **The gaps are held apart from the markup** while it comes off. Two gaps
   * with a word between them are three underscores, a word, and three more —
   * which is emphasis, if the markup is read with the gaps already written in.
   */
  it('keeps two gaps as gaps rather than reading them as emphasis', () => {
    expect(lines("Tell {['Ann', 'Bob']} that {['yes', 'no']}")).toEqual(['Tell ___ that ___'])
  })

  // A button for going somewhere; its label is nothing anybody says.
  it('leaves out a phrase that is only a link, and keeps one that is a sentence', () => {
    expect(
      lines(
        "[Today's menu](https://example.com/menu)",
        'Have a look at [the menu](https://example.com/menu) later',
      ),
    ).toEqual(['Have a look at the menu later'])
  })

  // "Good morning" is filed under three categories on purpose, and three copies
  // are three times the tokens and no more likely to be the answer.
  it('gives each wording once', () => {
    expect(lines('Good morning', 'Hello', 'Good morning')).toEqual(['Good morning', 'Hello'])
  })

  it('puts a phrase written over several lines on one', () => {
    expect(lines('First this\nand then that')).toEqual(['First this and then that'])
  })
})

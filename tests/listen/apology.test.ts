// What the board says while a reply is being written — see `listen/apology.ts`.
//
// Two things are being tested and they are not the same: **which one gets
// said**, which has to answer even with no key and no network, and **how more
// of them are asked for**, which must carry nothing of anybody's.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { APOLOGY_CACHE, SHIPPED_APOLOGIES, moreApologies, nextApology } from '../../src/listen/apology'
import { APOLOGY_REST_MS, NO_APOLOGIES, saveReplyKey, type Apologies } from '../../src/core/store'
import { warnings } from '../setup'

const NOW = 1_700_000_000_000
const cache = (over: Partial<Apologies> = {}): Apologies => ({ ...NO_APOLOGIES, ...over })

describe('which apology gets said', () => {
  it('is one written for this board while there are any', () => {
    const { text } = nextApology(cache({ ready: ['Sorry, one moment'] }), NOW)
    expect(text).toBe('Sorry, one moment')
  })

  // The whole job of this surface is not being silent, so it answers with no
  // key, no network and nothing written: the shipped ones are always there.
  it('is one the app ships with when nothing has been written', () => {
    const { text } = nextApology(NO_APOLOGIES, NOW)
    expect(SHIPPED_APOLOGIES).toContain(text)
  })

  it('is used up as it is said, so the next wait is different words', () => {
    const first = nextApology(cache({ ready: ['One', 'Two'] }), NOW)
    expect(first.text).toBe('One')
    expect(first.cache.ready).toEqual(['Two'])

    const second = nextApology(first.cache, NOW + 1000)
    expect(second.text).toBe('Two')
  })

  /**
   * **The same sentence every time is a machine somebody is listening to**,
   * rather than a person they are talking to, and it stops being an apology.
   */
  it('is never the same words twice within the hour', () => {
    let held = cache()
    const said: string[] = []
    for (let i = 0; i < SHIPPED_APOLOGIES.length; i++) {
      const next = nextApology(held, NOW + i * 60_000)
      said.push(next.text)
      held = next.cache
    }
    expect(new Set(said).size, 'it repeated itself inside an hour').toBe(said.length)
  })

  it('says one again once its hour is up', () => {
    const { text } = nextApology(
      cache({ ready: [], said: SHIPPED_APOLOGIES.map(t => ({ text: t, at: NOW })) }),
      NOW,
    )
    const later = nextApology(
      cache({ ready: [], said: SHIPPED_APOLOGIES.map(t => ({ text: t, at: NOW })) }),
      NOW + APOLOGY_REST_MS + 1,
    )
    expect(text).toBeTruthy()
    expect(SHIPPED_APOLOGIES).toContain(later.text)
  })

  // A repeat is better than the silence this exists to fill, and the one said
  // longest ago is the least of the repeats.
  it('comes round to the one said longest ago rather than saying nothing', () => {
    const said = [
      { text: 'Oldest', at: NOW - 30 * 60_000 },
      ...SHIPPED_APOLOGIES.map(t => ({ text: t, at: NOW - 60_000 })),
    ]
    const { text } = nextApology(cache({ said }), NOW)
    expect(text).toBe('Oldest')
  })

  // The hour is a window, not a ban: one said this morning is as good as new.
  it('takes one up again once its hour has passed', () => {
    const { text } = nextApology(
      cache({
        ready: ['Sorry, one moment'],
        said: [{ text: 'Sorry, one moment', at: NOW - 2 * APOLOGY_REST_MS }],
      }),
      NOW,
    )
    expect(text).toBe('Sorry, one moment')
  })

  it('writes down what it said, and when', () => {
    const { cache: after } = nextApology(cache({ ready: ['Sorry, one moment'] }), NOW)
    expect(after.said).toEqual([{ text: 'Sorry, one moment', at: NOW }])
  })
})

describe('asking for more of them', () => {
  beforeEach(() => saveReplyKey('sk-ant-test'))

  const answered = (text: string) =>
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }] }) }))

  it('takes one to a line, however they come back', async () => {
    const fetcher = answered('1. Sorry, one moment\n"Nearly there"\n\n- Bear with me')
    vi.stubGlobal('fetch', fetcher)

    await expect(moreApologies(3, '')).resolves.toEqual(['Sorry, one moment', 'Nearly there', 'Bear with me'])
  })

  it('asks for no more than are wanted', async () => {
    vi.stubGlobal('fetch', answered('One\nTwo\nThree\nFour'))
    await expect(moreApologies(2, '')).resolves.toHaveLength(2)
  })

  /**
   * **Nothing of theirs is in it**: no question, no phrase off the board, no
   * conversation. That is what makes it safe to ask for at any moment rather
   * than only while somebody is being answered.
   */
  it('carries nothing of the person it is for', async () => {
    const fetcher = answered('Sorry, one moment')
    vi.stubGlobal('fetch', fetcher)

    await moreApologies(APOLOGY_CACHE, 'Spanish')

    const [, init] = fetcher.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string> },
    ]
    const body = JSON.parse(init.body) as { messages: { content: string }[]; tools?: unknown }
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].content).toMatch(/Spanish/)
    expect(body.tools, 'nothing here needs looking up').toBeUndefined()
    expect(init.headers['x-api-key']).toBe('sk-ant-test')
  })

  it('says nothing to a board with no key, and asks nobody', async () => {
    saveReplyKey('')
    const fetcher = answered('Sorry')
    vi.stubGlobal('fetch', fetcher)

    await expect(moreApologies(3, '')).resolves.toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  // A failure costs nothing at all: the shipped ones answer, and the next fill
  // tries again.
  it('answers with nothing where Anthropic refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })),
    )
    await expect(moreApologies(3, '')).resolves.toEqual([])
    expect(warnings.join(' ')).toMatch(/apology/)
  })

  it('answers with nothing where there is no network, and never throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    )
    await expect(moreApologies(3, '')).resolves.toEqual([])
  })

  it('never puts the key in the console', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    )
    await moreApologies(3, '')
    expect(warnings.join(' ')).not.toContain('sk-ant-test')
  })
})

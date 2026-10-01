// **The speaking tab** through the real app: the page at its own address, what
// it shows and plays, and the Settings row that opens it. What passes between
// it and Peri is `voice/relay.test.ts`; whether a call can hear it is a
// question for a real browser, measured when it was built — see
// docs/decisions/speaking-into-a-call.md.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { $, $$, click, mount, renderApp } from './harness'
import { setAudioPlays } from '../setup'
import { type SpeakingMessage } from '../../src/voice/relay'

const at = (path: string) => window.history.replaceState({}, '', path)
afterEach(() => at('/'))

/** Peri's side of the channel, as another tab would hold it. */
async function say(text: string, clip = false) {
  const peri = new BroadcastChannel('peri-speaking')
  const answers: SpeakingMessage[] = []
  peri.onmessage = e => answers.push(e.data)
  await act(async () => {
    peri.postMessage({
      kind: 'said',
      id: 7,
      text,
      clip: clip ? new Blob(['audio']) : undefined,
    } satisfies SpeakingMessage)
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
  peri.close()
  return answers
}

const said = () => $('.speaking-said')?.textContent

describe('the page', () => {
  // Nobody's board, so nobody needs to be signed in, and nothing of one is drawn.
  it('is served at its own address, with nothing of the board on it', () => {
    at('/speaking')
    mount()

    expect(said()).toBe('What Peri says will appear here.')
    expect(document.title).toBe('Peri — speaking')
    expect($('.phrase-cell')).toBeNull()
    expect($('.auth-btn')).toBeNull()
    expect($('.emergency-btn')).toBeNull()
  })

  it('shows only the last thing said', async () => {
    at('/speaking')
    mount()
    await say('Good morning')
    await say('I would like a cup of tea')

    expect(said()).toBe('I would like a cup of tea')
    expect($$('.speaking-said')).toHaveLength(1)
  })

  it('plays a clip, and says it is playing', async () => {
    at('/speaking')
    mount()
    const answers = await say('Hello', true)

    expect(answers).toContainEqual({ kind: 'playing', id: 7 })
    expect($('.speaking-refused')).toBeNull()
  })

  // Peri plays a refused clip itself; the page asks for the click that lets the next one play here.
  it('asks for a click when the browser will not let it play, until there is one', async () => {
    at('/speaking')
    mount()
    setAudioPlays(false)
    const answers = await say('Hello', true)

    expect(answers).toContainEqual({ kind: 'refused', id: 7 })
    expect($('.speaking-refused')?.textContent).toMatch(/Click this page once/)

    act(() => void fireEvent.pointerDown(window))
    expect($('.speaking-refused')).toBeNull()
  })

  it('sets a long message smaller, so it still fits', async () => {
    at('/speaking')
    mount()
    await say('word '.repeat(40))
    expect($('.speaking-said')?.classList.contains('is-long')).toBe(true)
  })
})

describe('the Settings row', () => {
  const openSettings = () => {
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const openTheTab = () =>
    [...document.body.querySelectorAll<HTMLElement>('.panel-btn')].find(
      b => b.getAttribute('aria-label') === 'Open the tab',
    )
  const note = () => openTheTab()?.closest('.setting-row')?.querySelector('.setting-note')?.textContent

  it('opens the tab under one name, so a second time finds the first', () => {
    const opened = vi.fn(() => ({}) as Window)
    vi.stubGlobal('open', opened)
    renderApp()
    openSettings()
    click(openTheTab())

    expect(opened).toHaveBeenCalledWith('/speaking', 'peri-speaking')
    expect(note()).not.toMatch(/only for a click/)
  })

  // A rest is not a click, and a browser opens a tab only for one.
  it('says so, and where to go, when the browser will not open it', () => {
    vi.stubGlobal(
      'open',
      vi.fn(() => null),
    )
    renderApp()
    openSettings()
    click(openTheTab())

    expect(note()).toMatch(/only for a click or a tap/)
    expect(note()).toContain(`${window.location.origin}/speaking`)
  })
})

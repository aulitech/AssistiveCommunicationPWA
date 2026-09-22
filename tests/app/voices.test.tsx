// How the board sounds: which voice speaks, a phrase with a voice of its own, a linked ElevenLabs account, and the language the board is spoken in.
import { describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, act } from '@testing-library/react'
import { parseBackup } from '../../src/core/backup'
import { downloads, lastUtterance, played, spoken, voices } from '../setup'
import {
  $$,
  $,
  settle,
  click,
  renderApp,
  editToggle,
  speakToggle,
  plainCell,
  slotCell,
  iconBtn,
  phraseVoice,
  writePhrase,
  savePhrase,
} from './harness'

describe('the emergency bar with a linked account', () => {
  // The one place the better voice is refused. A request going out and coming
  // back is not what "I can't breathe" needs, and with the network down it is
  // nothing at all — so these phrases never leave the device, whatever is
  // selected. Testing it here rather than against speak() alone: the option has
  // to actually be passed, and the bar is the only caller that passes it.
  it('speaks on the device however good the chosen voice is', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    renderApp({ voiceURI: 'elevenlabs:v1' })

    click($('.emergency-btn'))

    expect(spoken).toEqual(['Help me!'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  // The grid does use it, or linking an account would have bought nothing.
  it('while the grid speaks with the account voice', async () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    const fetcher = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['audio']),
    }))
    vi.stubGlobal('fetch', fetcher)
    renderApp({ voiceURI: 'elevenlabs:v1', autoSpeak: true })

    click(plainCell())
    // The request no longer goes out in the same tick. Everywhere a clip may
    // already be is asked first, and the nearest of those — this device's own
    // disk — answers with a promise however empty it is.
    await act(async () => {})

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(spoken).toEqual([])
  })
})

describe('giving a phrase its own voice', () => {
  const LINKED = { apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel', collection: 'premade' }] }
  const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const voiceTrigger = phraseVoice
  /**
   * The same grid Settings uses. Choosing previews the voice, so what it spoke
   * is cleared afterwards — the tests below are about what saying the *phrase*
   * does, not about the preview.
   */
  const chooseVoice = async (name: string) => {
    click(voiceTrigger())
    click(inDoc('.picker-tile').find(el => (el.getAttribute('aria-label') ?? '').startsWith(name)))
    click(inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === 'Done'))
    await flush()
    played.length = 0
    spoken.length = 0
  }
  const enterEditMode = () => click(editToggle())
  const stored = () => JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2') ?? '{}').voiceOverrides ?? {}

  const linkAccount = () => localStorage.setItem('peri_elevenlabs', JSON.stringify(LINKED))
  const audioReplies = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) })),
    )
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }

  it('offers a voice on the phrase being edited, defaulting to none', () => {
    linkAccount()
    renderApp()
    enterEditMode()
    click(plainCell())

    expect(voiceTrigger()?.textContent).toContain('Same as everything else')

    click(voiceTrigger())
    expect(inDoc('.picker-tile').map(el => el.getAttribute('aria-label'))).toContain('Rachel · ElevenLabs')
  })

  // Coming back to a phrase has to show what it already carries, or there is no
  // way to tell what it is set to without changing it.
  it('shows the phrase its own voice when it is chosen again', async () => {
    linkAccount()
    audioReplies()
    renderApp()
    enterEditMode()
    const cell = plainCell()
    click(cell)
    await chooseVoice('Rachel')
    savePhrase()
    await flush()

    click(cell)
    expect(voiceTrigger()?.textContent).toContain('Rachel')
  })

  // A phrase written from nothing has no id until it is saved, so the voice has
  // to be hung on it afterwards. It was simply dropped before: the phrase came
  // out in the app's voice however carefully another had been chosen for it.
  it('gives a brand-new phrase the voice chosen for it', async () => {
    linkAccount()
    audioReplies()
    renderApp()
    enterEditMode()
    writePhrase('In her voice')
    await chooseVoice('Rachel')
    savePhrase()
    await flush()

    const store = JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2')!)
    const added = store.custom.find((c: { text: string }) => c.text === 'In her voice')
    expect(added, 'the phrase was not added at all').toBeDefined()
    // Under `''`, the board following the device — a voice is kept per language,
    // and that is the language this one was chosen in.
    expect(stored()[added.id]).toEqual({ '': 'elevenlabs:v1' })
  })

  it('remembers the voice against that phrase alone', async () => {
    linkAccount()
    audioReplies()
    renderApp()
    enterEditMode()
    const cell = plainCell()
    const text = cell.textContent!
    click(cell)

    await chooseVoice('Rachel')
    savePhrase()
    await flush()

    const overrides = stored()
    expect(Object.values(overrides)).toEqual([{ '': 'elevenlabs:v1' }])
    expect(text).not.toBe('')
  })

  // The whole reason the voice is assigned rather than merely recorded: it is
  // fetched there and then, so saying it later costs no wait.
  it('fetches the audio the moment the voice is assigned', async () => {
    linkAccount()
    const fetcher = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['audio']),
    }))
    vi.stubGlobal('fetch', fetcher)
    renderApp()
    enterEditMode()
    click(plainCell())

    await chooseVoice('Rachel')
    savePhrase()
    await flush()

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0][0])).toContain('/text-to-speech/v1')
  })

  it('speaks the phrase in its own voice rather than the chosen one', async () => {
    linkAccount()
    audioReplies()
    renderApp()

    enterEditMode()
    const cell = plainCell()
    click(cell)
    await chooseVoice('Rachel')
    savePhrase()
    await flush()

    // Auto-speak switches edit mode off by itself: the two are exclusive, and
    // the board cannot be a thing being spoken from and a thing being rewritten
    // at the same time.
    click(speakToggle())
    click(plainCell())
    await flush()

    expect(played).toHaveLength(1)
    expect(spoken).toEqual([])
  })

  // The point of the whole arrangement. Assigning fetches the audio, so by the
  // time the bar is pressed it is already here and there is nothing to wait for.
  // Tested from the button rather than from speak(): the option has to actually
  // be passed, and the bar is the only caller that passes it.
  it('keeps its voice on the emergency bar', async () => {
    linkAccount()
    audioReplies()
    renderApp()

    enterEditMode()
    click($('.emergency-btn'))
    await chooseVoice('Rachel')
    savePhrase()
    await flush()
    click(editToggle()) // leave edit mode

    // Nothing may be asked for at this point: the bar never waits.
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    click($('.emergency-btn'))
    await flush()

    expect(played, 'the emergency phrase did not use its own voice').toHaveLength(1)
    expect(spoken).toEqual([])
    expect(fetcher, 'the emergency bar went to the network').not.toHaveBeenCalled()
  })

  // A phrase carrying markdown is fetched and stored under the words it speaks,
  // because those are the words that will be asked for when it is spoken. Keyed
  // by the marked-up text instead, the clip is stored once and never found
  // again — and the emergency bar, which never waits, quietly drops back to the
  // device voice for a phrase somebody deliberately gave another.
  //
  // The wording is changed *after* the voice is chosen, and that ordering is the
  // whole test. Choosing a voice previews the phrase, and the preview goes
  // through `speak`, which strips — so a test that picks a voice and saves
  // without touching the text passes whether or not `warmVoice` strips at all.
  // Only the text that changed afterwards reaches the network through
  // `warmVoice` alone.
  it('stores a marked-up phrase under the words it speaks, not its markup', async () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ custom: [{ id: 'custom-md-em', text: 'Stop now', category: 'Emergency' }] }),
    )
    linkAccount()
    audioReplies()
    renderApp()
    const button = (text: string) => $$('.emergency-btn').find(b => b.textContent === text)

    enterEditMode()
    click(button('Stop now'))
    await chooseVoice('Rachel')
    writePhrase('**Stop** right now')
    savePhrase()
    await flush()
    click(editToggle()) // leave edit mode

    // Nothing may be asked for now: it was fetched when the phrase was saved.
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    click(button('Stop right now'))
    await flush()

    expect(played, 'the marked-up phrase did not use its own voice').toHaveLength(1)
    expect(spoken).toEqual([])
    expect(fetcher, 'it went back to the network for a clip already in hand').not.toHaveBeenCalled()
  })

  // The editor hands back what a phrase was *written* as, brackets and all, so
  // the warm-up has to compose it first. Fetched raw, the clip is stored under
  // text nothing ever asks for again — and the phrase quietly falls back to the
  // device voice, having been paid for twice.
  it('fetches what a phrase with choices reads as, not its brackets', async () => {
    linkAccount()
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, blob: async () => new Blob(['a']) }))
    vi.stubGlobal('fetch', fetcher)
    renderApp()

    enterEditMode()
    click(slotCell())
    await chooseVoice('Rachel')
    savePhrase()
    await flush()

    // The text field of each request, not the whole body — the JSON wrapper has
    // braces of its own, and matching those would fail whatever was sent.
    const said = (fetcher.mock.calls as unknown as [string, { body?: string }?][]).map(
      call => JSON.parse(String(call[1]?.body ?? '{}')).text as string,
    )
    expect(said.length, 'nothing was fetched at all').toBeGreaterThan(0)
    for (const text of said) {
      expect(text, 'the placeholder syntax was sent to be read aloud').not.toMatch(/[{}[\]]/)
    }
  })

  // The safety rule survives the change: a phrase whose audio is not in hand is
  // said by the device now rather than in the right voice in a second.
  it('falls straight back to the device when its audio is not in hand', async () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ voiceOverrides: { 'em-0': 'elevenlabs:v1' } }),
    )
    linkAccount()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    renderApp()

    click($('.emergency-btn'))
    await flush()

    expect(spoken).toEqual(['Help me!'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  /**
   * **A voice is a language**, so a phrase keeps one for each. A board that
   * speaks Spanish on Tuesday and English on Wednesday needs both answers kept,
   * or choosing a Spanish voice throws away the English one the phrase had and
   * Wednesday's phrase comes out read by a Spanish synthesiser.
   *
   * Driven through the store rather than the language picker, because switching
   * language in the panel is four dwells away from a grid this test is not
   * about — what is asserted is which voice reaches the synthesiser.
   */
  it("keeps a phrase's voice for each language, and speaks the right one", async () => {
    linkAccount()
    audioReplies()
    renderApp()
    enterEditMode()
    const cell = plainCell()
    const text = cell.textContent!
    click(cell)
    await chooseVoice('Rachel')
    savePhrase()
    await flush()

    const id = Object.keys(stored())[0]
    expect(id, 'no phrase was given a voice at all').toBeDefined()
    expect(stored()[id]).toEqual({ '': 'elevenlabs:v1' })

    // The same phrase, on a board now set to speak Vietnamese. It has no voice
    // for that language, so it must fall to the board's own rather than to an
    // English one reading Vietnamese.
    cleanup()
    renderApp({ language: 'vi', autoSpeak: true })
    played.length = 0
    click([...document.querySelectorAll('.phrase-cell')].find(c => c.textContent === text))
    await flush()
    expect(played, 'a phrase spoke its English voice on a Vietnamese board').toHaveLength(0)
  })

  it('carries the voice into a backup and back out again', async () => {
    linkAccount()
    audioReplies()
    renderApp()
    enterEditMode()
    click(plainCell())
    await chooseVoice('Rachel')
    savePhrase()
    await flush()

    click(editToggle())
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Backup & sharing'))
    click(inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === 'Save a file'))

    const result = parseBackup(downloads[downloads.length - 1].text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const carried = [...result.backup.added, ...result.backup.edited].some(
        e => e.voices?.[''] === 'elevenlabs:v1',
      )
      expect(carried, 'the voice did not travel with the backup').toBe(true)
    }
  })
})

describe('choosing a voice', () => {
  // The picker is portalled to the body, so it is not under the render
  // container the rest of these tests query.
  const inDocument = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const trigger = () => $('.voice-trigger')
  const modal = () => inDocument('.picker-modal')[0] ?? null
  const tiles = () => inDocument('.picker-tile')
  const tileNamed = (name: string) => tiles().find(el => el.getAttribute('aria-label')?.startsWith(name))
  const storedVoice = () => JSON.parse(localStorage.getItem('dwellspeak_settings') ?? '{}').voiceURI

  /** Seeded before mounting: the stub never fires `voiceschanged`. */
  const openSettings = (...names: string[]) => {
    voices.length = 0
    voices.push(...names.map(name => ({ voiceURI: `uri-${name}`, name, lang: 'en-GB' }) as SpeechSynthesisVoice))
    renderApp()
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const openPicker = (...names: string[]) => {
    openSettings(...names)
    click(trigger())
  }

  it('shows the chosen voice in settings without a list beside it', () => {
    openSettings('Daniel')
    expect(trigger()?.textContent).toContain('Default')
    expect(modal()).toBeNull()
  })

  // Sixty device voices in a 186px dropdown was the one list in this app a gaze
  // user could not realistically work through.
  it('opens a full-screen grid, not a dropdown', () => {
    openPicker('Daniel', 'Karen', 'Moira')

    expect(modal()).not.toBeNull()
    expect(inDocument('.picker-grid')).toHaveLength(1)
    expect(tiles().map(el => el.getAttribute('aria-label'))).toEqual([
      'Default',
      'Daniel · en-GB',
      'Karen · en-GB',
      'Moira · en-GB',
    ])
  })

  // Somebody who went to the trouble of linking an account is looking for those
  // voices, not scrolling past sixty the device came with.
  it('puts the account voices first', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    openPicker('Daniel', 'Karen')

    expect(tiles().map(el => el.getAttribute('aria-label'))).toEqual([
      'Default',
      'Rachel · ElevenLabs',
      'Daniel · en-GB',
      'Karen · en-GB',
    ])
  })

  // Sixty device voices and an account's worth on top is more than a grid can
  // usefully show at once.
  it('offers a chip per collection and per language, and narrows to it', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({
        apiKey: 'sk-test',
        voices: [
          { id: 'v1', name: 'Rachel', collection: 'premade' },
          { id: 'v2', name: 'Me', collection: 'cloned' },
        ],
      }),
    )
    openPicker('Daniel', 'Karen')

    const chips = inDocument('.picker-filter').map(c => c.textContent)
    expect(chips[0]).toMatch(/^All/)
    expect(chips.some(c => c?.startsWith('Premade'))).toBe(true)
    expect(chips.some(c => c?.startsWith('Cloned'))).toBe(true)
    expect(chips.some(c => /english/i.test(c ?? ''))).toBe(true)

    click(inDocument('.picker-filter').find(c => c?.textContent?.startsWith('Cloned')))
    expect(tiles().map(el => el.getAttribute('aria-label'))).toEqual(['Me · ElevenLabs'])

    click(inDocument('.picker-filter').find(c => c?.textContent?.startsWith('All')))
    expect(tiles().length).toBeGreaterThan(1)
  })

  // The chips outgrow the screen as soon as an account has a few collections,
  // and a row with no arrows is a row whose far end does not exist for anybody
  // without a wheel.
  it('scrolls the chip row once it is wider than the screen', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({
        apiKey: 'sk-test',
        voices: [
          { id: 'v1', name: 'Rachel', collection: 'premade' },
          { id: 'v2', name: 'Me', collection: 'cloned' },
        ],
      }),
    )
    openPicker('Daniel', 'Karen')
    const row = inDocument('.scroll-row-inner')[0]
    const arrows = () => inDocument('.scroll-row .pane-scroll-btn').map(b => b.getAttribute('aria-label'))

    expect(arrows(), 'arrows with nowhere to go').toEqual([])

    // jsdom lays nothing out, so the overflow they react to is supplied.
    const setWidths = (scrollLeft: number, clientWidth: number, scrollWidth: number) => {
      for (const [k, v] of Object.entries({ scrollLeft, clientWidth, scrollWidth })) {
        Object.defineProperty(row, k, { value: v, configurable: true })
      }
      fireEvent.scroll(row)
      settle()
    }

    setWidths(0, 300, 900)
    expect(arrows()).toEqual(['Scroll right'])

    setWidths(300, 300, 900)
    expect(arrows()).toEqual(['Scroll left', 'Scroll right'])

    setWidths(600, 300, 900)
    expect(arrows()).toEqual(['Scroll left'])

    const scrollBy = vi.fn()
    row.scrollBy = scrollBy
    click(inDocument('.scroll-row .pane-scroll-btn')[0])
    expect(scrollBy).toHaveBeenCalledWith({ left: -160, behavior: 'smooth' })
  })

  it('offers no chips when there is only one group to choose from', () => {
    openPicker('Daniel', 'Karen')
    expect(inDocument('.picker-filter')).toHaveLength(0)
  })

  it('marks the one in use', () => {
    openPicker('Daniel')
    expect(tileNamed('Default')?.getAttribute('aria-selected')).toBe('true')
    expect(tileNamed('Daniel')?.getAttribute('aria-selected')).toBe('false')
  })

  const action = (label: string) => inDocument('.panel-btn').find(b => b.getAttribute('aria-label') === label)

  // Nobody can tell sixty voices apart by name, and a preview button beside
  // each would put two targets in every tile — the worst thing to give someone
  // aiming by gaze. The tile is the preview.
  it('speaks a sample in the voice just chosen', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))

    expect(spoken).toHaveLength(1)
    expect(lastUtterance?.voice?.name).toBe('Karen')
  })

  it('stays open so the next one can be tried', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))
    expect(modal()).not.toBeNull()

    click(tileNamed('Daniel'))
    expect(spoken).toHaveLength(2)
    expect(lastUtterance?.voice?.name).toBe('Daniel')
  })

  it('previews at the volume and speed the app is set to', () => {
    voices.length = 0
    voices.push({ voiceURI: 'uri-Karen', name: 'Karen', lang: 'en-GB' } as SpeechSynthesisVoice)
    renderApp({ volume: 0.4, rate: 1.8 })
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
    click(trigger())
    click(tileNamed('Karen'))

    expect(lastUtterance).toMatchObject({ volume: 0.4, rate: 1.8 })
  })

  it('keeps the last one tried when Done', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))
    click(action('Done'))

    expect(modal()).toBeNull()
    expect(storedVoice()).toBe('uri-Karen')
    expect(trigger()?.textContent).toContain('Karen')
  })

  // Trying voices has to be free, or the preview is a trap.
  it('puts back the voice it started with when cancelled', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))
    click(tileNamed('Daniel'))
    click(action('Cancel'))

    expect(modal()).toBeNull()
    expect(storedVoice()).toBe('')
    expect(trigger()?.textContent).toContain('Default')
  })

  it('puts it back on Escape too', () => {
    openPicker('Daniel')
    click(tileNamed('Daniel'))
    fireEvent.keyDown(window, { key: 'Escape' })
    settle()

    expect(modal()).toBeNull()
    expect(storedVoice()).toBe('')
  })

  // Reopening after keeping one must not offer to revert to something older.
  it('starts each visit from the voice in use', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))
    click(action('Done'))

    click(trigger())
    click(tileNamed('Daniel'))
    click(action('Cancel'))

    expect(storedVoice()).toBe('uri-Karen')
  })

  // The menu panel is animated with `transform`, and a transformed ancestor
  // makes `position: fixed` resolve against that ancestor rather than the
  // viewport — which had the picker coming out a few hundred pixels wide,
  // squeezed inside the menu. jsdom lays nothing out, so the only part of that
  // a test can see is where the picker sits in the tree.
  it('is not inside the panel it opens from', () => {
    openPicker('Daniel')

    const scrim = inDocument('.picker-modal-scrim')[0]
    expect(scrim).toBeDefined()
    expect($('.top-panel')!.contains(scrim), 'the picker is inside the transformed panel').toBe(false)
    expect(scrim.parentElement).toBe(document.body)
  })

  // Sixty voices is the longest list in the app, and 80 pixels at a time is not
  // a way to get through it.
  it('offers all four scroll controls once there is somewhere to go', () => {
    openPicker('Daniel', 'Karen', 'Moira')
    const pane = inDocument('.picker-modal .scroll-pane-inner')[0]
    const controls = () => inDocument('.picker-modal .pane-scroll-btn').map(b => b.getAttribute('aria-label'))

    expect(controls(), 'nothing to scroll yet').toEqual([])

    for (const [prop, value] of Object.entries({ scrollTop: 300, clientHeight: 400, scrollHeight: 1200 })) {
      Object.defineProperty(pane, prop, { value, configurable: true })
    }
    fireEvent.scroll(pane)
    settle()

    expect(controls()).toEqual(['Go to top', 'Scroll up', 'Scroll down', 'Go to bottom'])
  })

  it('takes itself away again when closed', () => {
    openPicker('Daniel')
    click(action('Done'))
    expect(inDocument('.picker-modal-scrim')).toHaveLength(0)
  })

  it('answers a dwell like every other control', () => {
    openSettings('Daniel', 'Karen')

    fireEvent.pointerEnter(trigger()!)
    act(() => void vi.advanceTimersByTime(800))
    settle()
    expect(modal()).not.toBeNull()

    fireEvent.pointerEnter(tileNamed('Karen')!)
    act(() => void vi.advanceTimersByTime(800))
    settle()
    expect(storedVoice()).toBe('uri-Karen')
  })
})

describe('linking an ElevenLabs account', () => {
  const openSettings = () => {
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const keyField = () => $<HTMLInputElement>('input[aria-label="ElevenLabs API key"]')
  const btn = (label: string) => $$('.panel-btn, .secret-btn').find(b => b.getAttribute('aria-label') === label)
  // Portalled to the body, so not under the render container.
  const voiceOptions = () => {
    click($('.voice-trigger'))
    return [...document.body.querySelectorAll('.picker-tile')].map(o => o.getAttribute('aria-label'))
  }
  const respondWith = (voices: unknown[]) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ voices }) })),
    )
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }

  it('is offered in settings, unlinked, with the key hidden as it is typed', () => {
    renderApp()
    openSettings()

    expect(keyField()).not.toBeNull()
    // A key is a credential, and this panel spans the whole screen. Hidden
    // unless somebody asks for it — see the Show button, below.
    expect(keyField()?.type).toBe('password')
    expect(btn('Link')?.getAttribute('aria-disabled')).toBe('true')
  })

  /**
   * ElevenLabs shows a key once, at the moment it is made. A second device
   * needs the same one, so the device that has it has to be able to give it
   * back — which used to be impossible, the key being write-only here.
   */
  describe('reading the key back once it is linked', () => {
    const linked = () => {
      localStorage.setItem(
        'peri_elevenlabs',
        JSON.stringify({ apiKey: 'sk-secret-key', voices: [{ id: 'v1', name: 'Rachel' }] }),
      )
      renderApp()
      openSettings()
    }

    it('holds the key hidden, and shows it when asked', () => {
      linked()

      expect(keyField()?.value).toBe('sk-secret-key')
      expect(keyField()?.type).toBe('password')

      click(btn('Show the API key'))
      expect(keyField()?.type).toBe('text')
    })

    it('copies it without showing it', async () => {
      linked()

      click(btn('Copy the API key'))
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sk-secret-key')
      await act(async () => {})
      expect(keyField()?.type, 'copying revealed it').toBe('password')
    })

    // It is the account's key, not a phrase — nothing here may write to it.
    it('cannot be typed over', () => {
      linked()
      expect(keyField()?.readOnly).toBe(true)
    })
  })

  it('adds the account voices to the picker, above the device ones', async () => {
    renderApp()
    openSettings()
    respondWith([
      { voice_id: 'v1', name: 'Rachel' },
      { voice_id: 'v2', name: 'Adam' },
    ])

    fireEvent.change(keyField()!, { target: { value: 'sk-test' } })
    settle()
    click(btn('Link'))
    await flush()

    expect($('.eleven-status')?.textContent).toMatch(/2 voices/)
    expect(voiceOptions()).toEqual(['Default', 'Rachel · ElevenLabs', 'Adam · ElevenLabs'])
  })

  it('keeps the account across a reload, and the key out of sight', async () => {
    renderApp()
    openSettings()
    respondWith([{ voice_id: 'v1', name: 'Rachel' }])
    fireEvent.change(keyField()!, { target: { value: 'sk-test' } })
    settle()
    click(btn('Link'))
    await flush()

    expect(JSON.parse(localStorage.getItem('peri_elevenlabs')!).apiKey).toBe('sk-test')
    // Not in the phrase store, the profile or the settings — the three things a
    // backup is built from.
    for (const key of ['dwellspeak_phrase_store_v2', 'dwellspeak_profile', 'dwellspeak_settings']) {
      expect(localStorage.getItem(key) ?? '').not.toContain('sk-test')
    }
  })

  it('says what went wrong and links nothing', async () => {
    renderApp()
    openSettings()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    )

    fireEvent.change(keyField()!, { target: { value: 'wrong' } })
    settle()
    click(btn('Link'))
    await flush()

    expect($('.eleven-error')?.textContent).toMatch(/not accepted/i)
    expect(localStorage.getItem('peri_elevenlabs')).toBeNull()
    expect(keyField()).not.toBeNull()
  })

  // Unlinking with one of its voices chosen would leave the picker naming a
  // voice that is not there any more.
  it('hands the voice back to the device when unlinked', async () => {
    renderApp()
    openSettings()
    respondWith([{ voice_id: 'v1', name: 'Rachel' }])
    fireEvent.change(keyField()!, { target: { value: 'sk-test' } })
    settle()
    click(btn('Link'))
    await flush()

    click($('.voice-trigger'))
    click(
      [...document.body.querySelectorAll('.picker-tile')].find(o =>
        o.getAttribute('aria-label')?.includes('Rachel'),
      ),
    )
    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).voiceURI).toBe('elevenlabs:v1')

    click(btn('Unlink'))
    settle()

    expect(localStorage.getItem('peri_elevenlabs')).toBeNull()
    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).voiceURI).toBe('')
    expect(keyField()).not.toBeNull()
  })
})

/**
 * The language the board is spoken in.
 *
 * Its whole job is the case where no specific voice applies — including the one
 * where a `voiceURI` arrived from another device and names nothing here. So
 * what is asserted is what comes out of the synthesiser, not what the row says.
 */
describe('the spoken language', () => {
  const languageRow = () =>
    [...document.querySelectorAll('.setting-row')].find(r => r.textContent?.includes('Spoken language'))
  const openSettings = () => {
    click(iconBtn('Open menu'))
    click([...document.querySelectorAll('[role="button"]')].find(b => b.textContent?.includes('Settings')))
  }

  it('is a row in the settings panel, set to the device by default', () => {
    renderApp()
    openSettings()
    const row = [...document.querySelectorAll('.setting-row')].find(r =>
      r.textContent?.includes('Spoken language'),
    )
    expect(row, 'there is no spoken language row').toBeTruthy()
    expect(row?.textContent).toContain('Device default')
  })

  /**
   * **The grid waits for Done or Cancel.** It closed on the first tile a rest
   * landed on, with a Cancel beside it that did what Done did — so somebody
   * looking over the languages to find theirs chose whichever one their eye
   * reached first. A tile marks the choice now and nothing is written until Done.
   */
  describe('choosing one', () => {
    const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
    const tile = (name: string) =>
      inDoc('.picker-tile').find(t => t.querySelector('.picker-tile-name')?.textContent === name)
    const action = (label: string) =>
      inDoc('.picker-modal-actions .panel-btn').find(b => b.getAttribute('aria-label') === label)
    const stored = () => JSON.parse(localStorage.getItem('dwellspeak_settings') ?? '{}').language ?? ''
    const openGrid = () => {
      renderApp()
      openSettings()
      click(languageRow()!.querySelector('.picker-trigger'))
    }
    /** Any language this device offers other than the one the board is in. */
    const another = () =>
      inDoc('.picker-tile .picker-tile-name')
        .map(n => n.textContent!)
        .find(n => n !== 'Device default')!

    it('stays open when a language is rested on, and writes nothing yet', () => {
      openGrid()
      const name = another()
      click(tile(name))

      expect(inDoc('.picker-modal'), 'the first tile closed the grid').toHaveLength(1)
      expect(tile(name)!.getAttribute('aria-selected'), 'the tile does not show it is marked').toBe('true')
      expect(stored(), 'written before anybody said Done').toBe('')
    })

    it('writes the one marked last when Done is chosen', () => {
      openGrid()
      const name = another()
      click(tile(name))
      click(action('Done'))

      expect(inDoc('.picker-modal')).toHaveLength(0)
      expect(stored(), 'Done kept nothing').not.toBe('')
    })

    /**
     * **Done with nothing moved writes nothing.** Choosing the language the board
     * is already in still writes the voice in use into the voice memory — a board
     * set up before a voice was remembered per language has one in use and none
     * remembered — and that is a change to the settings, which would travel to
     * the other devices and arrive there as a notice about nothing.
     */
    it('writes nothing when Done is chosen with nothing changed', () => {
      renderApp({ voiceURI: 'Samantha', voicesByLanguage: {} })
      openSettings()
      click(languageRow()!.querySelector('.picker-trigger'))
      const before = localStorage.getItem('dwellspeak_settings')

      click(action('Done'))
      expect(inDoc('.picker-modal')).toHaveLength(0)
      expect(localStorage.getItem('dwellspeak_settings'), 'a Done that changed nothing wrote the settings').toBe(
        before,
      )
    })

    // A Cancel that did what Done did was a second button meaning nothing.
    it('writes nothing when cancelled', () => {
      openGrid()
      click(tile(another()))
      click(action('Cancel'))

      expect(inDoc('.picker-modal')).toHaveLength(0)
      expect(stored()).toBe('')
    })
  })

  it('is what a phrase is spoken in when no voice has been chosen', () => {
    renderApp({ language: 'fr-FR', autoSpeak: true })

    click(plainCell())
    expect(lastUtterance?.lang).toBe('fr-FR')
  })

  it('says nothing about the language until somebody sets one', () => {
    renderApp({ autoSpeak: true })
    click(plainCell())
    expect(lastUtterance?.lang).toBe('')
  })

  /**
   * **The disclosure lives on this row now.** It had a row of its own while the
   * key was the user's to paste in; there is no key to paste, so what says that
   * phrases leave the device has to sit on the control that starts them
   * leaving. It is one of three documents that have to agree — this, the guide,
   * and the privacy policy — so it is asserted rather than trusted.
   */

  it('says what leaves the device once a language is set', () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    renderApp({ language: 'fr-FR' })
    openSettings()
    expect(languageRow()?.textContent).toContain('sent to Google')
  })

  /**
   * A build that went out without its key. Invisible from the board — a phrase
   * somebody wrote is simply spoken in English — so the row is the only place it
   * can be said.
   */
  it('says so when the build carries no key, rather than promising a translation', () => {
    renderApp({ language: 'fr-FR' })
    openSettings()
    const said = languageRow()?.textContent ?? ''
    expect(said).toContain('no translation key')
    expect(said, 'promised a translation this build cannot make').not.toContain('sent to Google')
  })

  // Nothing is sent while the board speaks the language it is written in, so
  // there is nothing to disclose and no line of small print to read past.
  it('says nothing at all while the language is the device default', () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    renderApp()
    openSettings()
    expect(languageRow()?.querySelector('.setting-note')).toBeNull()
  })
})

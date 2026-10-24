// Presentation mode through the real app: the toggle beside please opening a
// window of its own, what is said reaching it, the window's page itself — the
// words, the camera and the picture behind them — and the picture's row in
// Settings. See docs/decisions/presentation-mode.md.
//
// jsdom opens no windows, so the window here is an object standing in for one,
// carrying the stage its page would put on itself. That the real page does so,
// in a real second window, is `e2e/presentation.spec.ts`'s question.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { buildBackup } from '../../src/core/backup'
import { EMPTY_ALIASES } from '../../src/core/phrases'
import {
  DEFAULT_SETTINGS,
  emptyStore,
  loadPresentationBackground,
  savePresentationBackground,
  storageKey,
} from '../../src/core/store'
import { PRESENTATION_BACKGROUND_KEY } from '../../src/core/store/keys'
import { setStage, type Stage } from '../../src/voice/speech'
import { PRESENTATION_PATH, STAGE_READY, type PresentingWindow } from '../../src/talk/use-presentation'
import { $, $$, click, mount, plainCell, renderApp, settle } from './harness'

vi.mock('../../src/menu/picture', () => ({
  shrinkPicture: vi.fn(async () => 'data:image/jpeg;base64,c21hbGw='),
}))

const presentToggle = () => $('.present-toggle')!

/** A window as `window.open` hands one back, with the stage its page would put on it. */
function fakeWindow() {
  const stage = { show: vi.fn(), play: vi.fn(async () => {}), stop: vi.fn() }
  const w = { closed: false, close: vi.fn(), periStage: stage as Stage }
  w.close.mockImplementation(() => {
    w.closed = true
  })
  return { w: w as unknown as PresentingWindow & { closed: boolean }, stage }
}

/** The window's page saying it is ready, as `talk/presentation.tsx` does. */
function ready(source: unknown) {
  const ev = new MessageEvent('message', { data: STAGE_READY, origin: location.origin })
  Object.defineProperty(ev, 'source', { value: source })
  act(() => void window.dispatchEvent(ev))
}

afterEach(() => {
  vi.restoreAllMocks()
  setStage(null)
})

describe('the toggle', () => {
  it('opens a window of its own, and is lit while it is open', () => {
    const { w } = fakeWindow()
    const open = vi.spyOn(window, 'open').mockReturnValue(w)
    renderApp()
    expect(presentToggle().getAttribute('aria-pressed')).toBe('false')

    click(presentToggle())
    expect(open).toHaveBeenCalledWith(PRESENTATION_PATH, 'peri-presentation', expect.stringContaining('popup'))
    expect(presentToggle().getAttribute('aria-pressed')).toBe('true')
    // As every mode says it changed.
    expect($('.toast')?.textContent).toBe('Presenting — what is said shows in its own window')

    act(() => void vi.advanceTimersByTime(1100))
    click(presentToggle())
    expect($('.toast')?.textContent).toBe('Presentation window closed')
  })

  // Opened off a dwell, which a browser does not count as a press.
  it('says how to let it open when the browser refuses', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    renderApp()
    click(presentToggle())
    expect($('.toast')?.textContent).toMatch(/allow pop-ups/i)
    expect(presentToggle().getAttribute('aria-pressed')).toBe('false')
  })

  it('shows there what is said once the window is ready, and nothing before', () => {
    const { w, stage } = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(w)
    renderApp({ autoSpeak: true })
    click(presentToggle())

    const first = plainCell()
    click(first)
    expect(stage.show, 'spoken through a window that had not said it was ready').not.toHaveBeenCalled()

    ready(w)
    const next = plainCell([first.textContent ?? ''])
    click(next)
    expect(stage.show).toHaveBeenCalledWith(next.textContent)
  })

  // Somebody else's window saying it is ready is no reason to speak through it.
  it('takes no notice of a window it did not open', () => {
    const { w, stage } = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(w)
    renderApp({ autoSpeak: true })
    click(presentToggle())
    ready(fakeWindow().w)
    click(plainCell())
    expect(stage.show).not.toHaveBeenCalled()
  })

  it('closes the window when it is turned off, and shows nothing more there', () => {
    const { w, stage } = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(w)
    renderApp({ autoSpeak: true })
    click(presentToggle())
    ready(w)

    click(presentToggle())
    expect(w.close).toHaveBeenCalled()
    expect(presentToggle().getAttribute('aria-pressed')).toBe('false')
    click(plainCell())
    expect(stage.show).not.toHaveBeenCalled()
  })

  // A window closed from its own side says nothing as it goes.
  it('goes out when the window is closed from its own side', () => {
    const { w, stage } = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(w)
    renderApp({ autoSpeak: true })
    click(presentToggle())
    ready(w)

    w.closed = true
    act(() => void vi.advanceTimersByTime(1000))
    expect(presentToggle().getAttribute('aria-pressed')).toBe('false')
    expect($('.toast')?.textContent, 'said nothing as it went').toBe('Presentation window closed')
    click(plainCell())
    expect(stage.show).not.toHaveBeenCalled()
  })
})

describe('the window', () => {
  const opener = { postMessage: vi.fn() }
  const openPage = () => {
    window.history.pushState({}, '', PRESENTATION_PATH)
    Object.defineProperty(window, 'opener', { value: opener, configurable: true })
    localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
    mount()
  }
  const stage = () => (window as PresentingWindow).periStage!
  const said = (text: string) => act(() => stage().show(text))

  afterEach(() => {
    window.history.pushState({}, '', '/')
    Object.defineProperty(window, 'opener', { value: null, configurable: true })
    opener.postMessage.mockClear()
  })

  it('tells Peri it is ready, and waits with a line saying what it is for', () => {
    openPage()
    expect(opener.postMessage).toHaveBeenCalledWith(STAGE_READY, location.origin)
    expect($('.presentation-waiting')?.textContent).toMatch(/what peri says appears here/i)
  })

  it('shows the newest thing said large, and what came before it smaller above', () => {
    openPage()
    for (const words of ['One', 'Two', 'Three', 'Four', 'Five']) said(words)
    expect($('.presentation-latest')?.textContent).toBe('Five')
    expect($$('.presentation-earlier').map(p => p.textContent)).toEqual(['One', 'Two', 'Three', 'Four'])
    expect($('.presentation-waiting')).toBeNull()
  })

  // Scrolled up out of the band rather than taken off it, so twenty are kept —
  // more than the band ever shows — and no more.
  it('keeps the last twenty things said, the newest last', () => {
    openPage()
    for (let n = 1; n <= 25; n++) said(`Line ${n}`)
    const lines = $$('.presentation-said p').map(p => p.textContent)
    expect(lines).toHaveLength(20)
    expect(lines[0]).toBe('Line 6')
    expect(lines.at(-1)).toBe('Line 25')
  })

  it('scrolls to the newest each time something is said', () => {
    openPage()
    const band = $('.presentation-said')!
    let top = 0
    Object.defineProperty(band, 'scrollHeight', { configurable: true, get: () => 300 + top })
    Object.defineProperty(band, 'scrollTop', { configurable: true, get: () => top, set: v => void (top = v) })
    said('One')
    expect(top).toBe(300)
    said('Two')
    expect(top).toBe(600)
  })

  // A browser plays sound only in a window somebody has pressed in; until then
  // Peri plays it, and the window says so.
  it('says when the sound is playing from Peri instead, until it is pressed in', async () => {
    openPage()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
    await act(async () => {
      await stage()
        .play('blob:x', 1, 1, () => {})
        .catch(() => {})
    })
    expect($('.presentation-note')?.textContent).toMatch(/playing from peri/i)

    act(() => void window.dispatchEvent(new Event('pointerdown')))
    expect($('.presentation-note')).toBeNull()
  })

  it('shows the camera a dwell away, and lets it go again', async () => {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] }
    const getUserMedia = vi.fn(async () => stream)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    openPage()

    click($('.presentation-camera-toggle'))
    await act(async () => {})
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false })
    expect($('video.presentation-camera')).not.toBeNull()
    expect($('.presentation')?.classList.contains('has-camera')).toBe(true)

    settle()
    act(() => void vi.advanceTimersByTime(1100))
    click($('.presentation-camera-toggle'))
    expect($('video.presentation-camera')).toBeNull()
    expect(stop).toHaveBeenCalled()
  })

  // Two pictures would compete, and the face is the one being watched.
  it('hides the picture behind it while the camera is on, and shows it again after', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] }
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => stream) },
      configurable: true,
    })
    savePresentationBackground('data:image/jpeg;base64,bmV3')
    openPage()
    expect($('.presentation')?.style.backgroundImage).toContain('bmV3')

    click($('.presentation-camera-toggle'))
    await act(async () => {})
    expect($('.presentation')?.style.backgroundImage, 'the picture stayed up behind the camera').toBe('')
    expect($('.presentation')?.classList.contains('has-background')).toBe(false)

    settle()
    act(() => void vi.advanceTimersByTime(1100))
    click($('.presentation-camera-toggle'))
    expect($('.presentation')?.style.backgroundImage).toContain('bmV3')
  })

  describe('the microphone, mixed in with the camera or without it', () => {
    /** A camera and a microphone, each a stream whose tracks say when they are stopped. */
    function devices() {
      const stopped = { camera: vi.fn(), microphone: vi.fn() }
      const getUserMedia = vi.fn(async (asked: MediaStreamConstraints) => ({
        getTracks: () => [{ stop: asked.audio ? stopped.microphone : stopped.camera }],
      }))
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
      return { getUserMedia, stopped }
    }
    const mic = () => $('.presentation-mic-toggle')
    const pause = () => {
      settle()
      act(() => void vi.advanceTimersByTime(1100))
    }
    const cameraOn = async () => {
      click($('.presentation-camera-toggle'))
      await act(async () => {})
      pause()
    }

    // Somebody presenting with no camera wants the room heard just the same.
    it('is offered with no camera, and opens without one', async () => {
      const { getUserMedia } = devices()
      openPage()
      expect($('video.presentation-camera')).toBeNull()
      click(mic())
      await act(async () => {})
      expect(getUserMedia).toHaveBeenCalledTimes(1)
      expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: false }))
      expect(mic()?.classList.contains('active')).toBe(true)
      expect($('video.presentation-camera'), 'the microphone brought the camera with it').toBeNull()
    })

    // Played out of the speakers, it comes back into the microphone.
    it('opens the microphone with echo cancellation, and plays it out of this window', async () => {
      const { getUserMedia } = devices()
      openPage()
      click(mic())
      await act(async () => {})

      expect(getUserMedia).toHaveBeenLastCalledWith({
        audio: expect.objectContaining({ echoCancellation: true }),
        video: false,
      })
      const out = $<HTMLAudioElement>('audio.presentation-heard')!
      expect(out.srcObject, 'the microphone is not played out of the window').not.toBeNull()
      expect(mic()?.classList.contains('active')).toBe(true)
    })

    it('lets it go when turned off', async () => {
      const { stopped } = devices()
      openPage()
      click(mic())
      await act(async () => {})
      pause()
      click(mic())
      expect(stopped.microphone).toHaveBeenCalledTimes(1)
      expect($<HTMLAudioElement>('audio.presentation-heard')!.srcObject).toBeNull()
      expect(mic()?.classList.contains('active')).toBe(false)
    })

    it('is left alone by the camera coming and going', async () => {
      const { stopped } = devices()
      openPage()
      click(mic())
      await act(async () => {})
      pause()
      await cameraOn()
      click($('.presentation-camera-toggle'))
      await act(async () => {})

      expect(stopped.camera).toHaveBeenCalledTimes(1)
      expect(stopped.microphone, 'the camera took the microphone with it').not.toHaveBeenCalled()
      expect($<HTMLAudioElement>('audio.presentation-heard')!.srcObject).not.toBeNull()
      expect(mic()?.classList.contains('active')).toBe(true)
    })

    it('leaves the camera alone when it is turned off', async () => {
      const { stopped } = devices()
      openPage()
      await cameraOn()
      click(mic())
      await act(async () => {})
      pause()
      click(mic())
      await act(async () => {})
      expect(stopped.camera).not.toHaveBeenCalled()
      expect($('video.presentation-camera')).not.toBeNull()
    })

    it('says so when the microphone cannot be opened', async () => {
      const { getUserMedia } = devices()
      openPage()
      getUserMedia.mockRejectedValueOnce(new Error('denied'))
      click(mic())
      await act(async () => {})
      expect($('.presentation-note')?.textContent).toMatch(/microphone could not be opened/i)
    })

    // A browser plays nothing in a window nobody has pressed in.
    it('says when it cannot play until the window is pressed in, and plays once it is', async () => {
      devices()
      openPage()
      const play = vi
        .spyOn(HTMLMediaElement.prototype, 'play')
        .mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
      click(mic())
      await act(async () => {})
      expect($('.presentation-note')?.textContent).toMatch(/play the microphone here/i)

      await act(async () => void window.dispatchEvent(new Event('pointerdown')))
      expect(play).toHaveBeenCalledTimes(2)
      expect($('.presentation-note')).toBeNull()
    })
  })

  it('says so when the camera cannot be opened', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    })
    openPage()
    click($('.presentation-camera-toggle'))
    await act(async () => {})
    expect($('.presentation-note')?.textContent).toMatch(/camera could not be opened/i)
  })

  it('shows the picture chosen in Settings, and a new one the moment it is chosen', () => {
    openPage()
    expect($('.presentation')?.style.backgroundImage).toBe('')

    savePresentationBackground('data:image/jpeg;base64,bmV3')
    act(
      () =>
        void window.dispatchEvent(new StorageEvent('storage', { key: storageKey(PRESENTATION_BACKGROUND_KEY) })),
    )
    expect($('.presentation')?.style.backgroundImage).toContain('data:image/jpeg;base64,bmV3')
  })
})

describe('the picture behind it, in Settings', () => {
  const openSettings = () => {
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const row = () =>
    $$('.setting-row').find(r => r.querySelector('.setting-label')?.textContent === 'Presentation background')!
  const button = (label: string) =>
    [...row().querySelectorAll('[role="button"]')].find(b => b.getAttribute('aria-label') === label)

  it('keeps a picture chosen, small, and takes it away again', async () => {
    renderApp()
    openSettings()
    expect(row().querySelector('img')).toBeNull()

    const input = row().querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['x'], 'beach.jpg', { type: 'image/jpeg' })] } })
    // Named from its bytes before it is kept, which is real work rather than a
    // tick — so waited for, not assumed done.
    await act(() => vi.waitFor(() => expect(loadPresentationBackground()).toBe('data:image/jpeg;base64,c21hbGw=')))
    expect(row().querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,c21hbGw=')

    settle()
    act(() => void vi.advanceTimersByTime(1100))
    click(button('Remove'))
    expect(loadPresentationBackground()).toBe('')
    expect(row().querySelector('img')).toBeNull()
  })

  // Hundreds of times the size of everything else in a backup put together.
  it('is in no backup', () => {
    renderApp()
    savePresentationBackground('data:image/jpeg;base64,c21hbGw=')
    const backup = JSON.stringify(
      buildBackup({ store: emptyStore(), aliases: EMPTY_ALIASES, settings: DEFAULT_SETTINGS }),
    )
    expect(backup).not.toContain('data:image')
  })
})
